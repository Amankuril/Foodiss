import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodTransaction } from '../models/foodTransaction.model.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';
import {
  createRazorpayQrCode,
  fetchRazorpayQrCode,
  fetchRazorpayQrPayments,
  fetchRazorpayPaymentLink,
  isRazorpayConfigured,
} from '../helpers/razorpay.helper.js';
import * as foodTransactionService from './foodTransaction.service.js';
import {
  buildOrderIdentityFilter,
  enqueueOrderEvent,
} from './order.helpers.js';

export async function syncRazorpayQrPayment(orderDoc) {
  const orderId = orderDoc?._id;
  // FoodTransaction is source of truth; FoodOrder.payment is fallback
  const tx = await FoodTransaction.findOne({ orderId }).lean();
  const payment = tx?.payment || orderDoc?.payment || null;
  if (!payment) {
    logger.warn(`[QrSync] No payment found for order ${orderId}`);
    return null;
  }

  // Allow sync if either tx OR FoodOrder has razorpay_qr method
  const isQrMethod = payment.method === 'razorpay_qr';
  if (!isQrMethod) return payment;
  if (payment.status === 'paid') return payment;

  if (!isRazorpayConfigured()) {
    logger.warn(`[QrSync] Razorpay not configured – cannot sync order ${orderId}`);
    return payment;
  }

  const qrId = payment?.qr?.qrId;
  const paymentLinkId = payment?.qr?.paymentLinkId;

  let qrStatus = '';
  let isPaid = false;
  let isFailed = false;
  let razorpayPaymentId = '';

  // Prefer Razorpay Dynamic QR Codes API (qr_xxx). Fall back to legacy payment links.
  if (qrId) {
    try {
      const qr = await fetchRazorpayQrCode(qrId);
      qrStatus = String(qr?.status || '').toLowerCase();
      const amountReceived = Number(qr?.payments_amount_received || 0);
      const countReceived = Number(qr?.payments_count_received || 0);
      isPaid = countReceived > 0 || amountReceived > 0;

      if (!isPaid) {
        try {
          const payments = await fetchRazorpayQrPayments(qrId, { count: 5 });
          const items = Array.isArray(payments?.items) ? payments.items : [];
          const captured = items.find((p) =>
            ['captured', 'authorized', 'paid'].includes(String(p?.status || '').toLowerCase()),
          );
          if (captured) {
            isPaid = true;
            razorpayPaymentId = String(captured.id || '');
          }
        } catch (paymentsError) {
          logger.warn(
            `[QrSync] QR payments fetch skipped for ${qrId}: ${paymentsError?.message || paymentsError}`,
          );
        }
      }

      // single_use QR closes after payment; closed without money = expired/cancelled
      if (!isPaid && qrStatus === 'closed') {
        isFailed = true;
      }

      logger.info(
        `[QrSync] Razorpay QR ${qrId} status=${qrStatus} paid=${isPaid} amountReceived=${amountReceived}`,
      );
    } catch (error) {
      logger.error(
        `[QrSync] Razorpay QR fetch FAILED for ${qrId}: ${error?.message || error}`,
      );
      return payment;
    }
  } else if (paymentLinkId) {
    let link;
    try {
      link = await fetchRazorpayPaymentLink(paymentLinkId);
      logger.info(`[QrSync] Razorpay link status for ${paymentLinkId}: ${link?.status}`);
    } catch (error) {
      logger.error(
        `[QrSync] Razorpay payment-link fetch FAILED for ${paymentLinkId}: ${
          error?.message || error
        }`,
      );
      return payment;
    }

    qrStatus = String(link?.status || '').toLowerCase();
    if (!qrStatus) {
      logger.warn(`[QrSync] Empty linkStatus for ${paymentLinkId}`);
      return payment;
    }

    // Razorpay Payment Link statuses: created, partially_paid, paid, expired, cancelled
    isPaid = ['paid', 'partially_paid', 'captured', 'authorized'].includes(qrStatus);
    isFailed = ['expired', 'cancelled', 'canceled', 'failed'].includes(qrStatus);
  } else {
    logger.warn(`[QrSync] No qrId/paymentLinkId for order ${orderId}`);
    return payment;
  }

  const newPaymentStatus = isPaid ? 'paid' : isFailed ? 'failed' : (payment.status || 'pending_qr');

  logger.info(`[QrSync] Updating order ${orderId} payment.status from '${payment.status}' to '${newPaymentStatus}'`);

  const paymentSet = {
    'payment.qr.status': qrStatus || payment?.qr?.status || 'active',
    'payment.status': newPaymentStatus,
  };
  if (razorpayPaymentId) {
    paymentSet['payment.razorpay.paymentId'] = razorpayPaymentId;
    paymentSet['gateway.razorpayPaymentId'] = razorpayPaymentId;
  }

  // Update FoodTransaction (upsert in case it didn't exist)
  await FoodTransaction.updateOne(
    { orderId },
    { $set: paymentSet },
  );

  // Keep FoodOrder in sync too
  if (isPaid) {
    await FoodOrder.updateOne(
      { _id: orderId },
      {
        $set: {
          'payment.status': 'paid',
          'payment.qr.status': 'paid',
          ...(razorpayPaymentId ? { 'payment.razorpay.paymentId': razorpayPaymentId } : {}),
        },
      },
    );
  }

  const updatedTx = await FoodTransaction.findOne({ orderId }).lean();
  return updatedTx?.payment || payment;
}



export async function createCollectQr(
  orderId,
  deliveryPartnerId,
  _customerInfo = {},
) {
  const query = mongoose.Types.ObjectId.isValid(orderId)
    ? { _id: orderId }
    : { orderId };

  const order = await FoodOrder.findOne(query)
    .populate('userId', 'name email phone')
    .lean();

  if (!order) throw new NotFoundError('Order not found');
  if (
    order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()
  ) {
    throw new ForbiddenError('Not your order');
  }
  const tx = await FoodTransaction.findOne({ orderId: order._id }).lean();
  const payment = tx?.payment || order.payment || {};
  if (payment.method !== 'cash' && payment.status === 'paid') {
    throw new ValidationError('Order already paid');
  }

  const amountDue = payment.amountDue ?? tx?.pricing?.total ?? order.pricing?.total ?? 0;
  if (amountDue < 1) throw new ValidationError('No amount due');
  if (!isRazorpayConfigured()) {
    throw new ValidationError('QR payment not configured');
  }

  // Reuse an active Razorpay QR if one was already created for this collection.
  const existingQrId = payment?.qr?.qrId;
  const existingImageUrl = payment?.qr?.imageUrl;
  const existingStatus = String(payment?.qr?.status || '').toLowerCase();
  const existingExpiry = payment?.qr?.expiresAt ? new Date(payment.qr.expiresAt).getTime() : 0;
  const canReuseExisting =
    existingQrId &&
    existingImageUrl &&
    payment?.method === 'razorpay_qr' &&
    payment?.status !== 'paid' &&
    !['closed', 'expired', 'cancelled', 'canceled', 'failed'].includes(existingStatus) &&
    (!existingExpiry || existingExpiry > Date.now() + 60 * 1000);

  if (canReuseExisting) {
    return {
      qrId: existingQrId,
      imageUrl: existingImageUrl,
      shortUrl: existingImageUrl,
      amount: amountDue,
      expiresAt: payment?.qr?.expiresAt || null,
    };
  }

  const orderRef = order.orderId || order._id.toString();
  const closeByUnix = Math.floor(Date.now() / 1000) + 45 * 60; // 45 min window for doorstep collect
  let qr;
  try {
    qr = await createRazorpayQrCode({
      amountPaise: Math.round(Number(amountDue) * 100),
      name: `COD ${String(orderRef).slice(-12)}`,
      description: `Order ${orderRef} - COD collect`,
      orderId: order._id.toString(),
      closeByUnix,
      notes: {
        foodOrderId: order._id.toString(),
        publicOrderId: String(orderRef),
        deliveryPartnerId: String(deliveryPartnerId),
      },
    });
  } catch (error) {
    const razorpayMessage =
      error?.error?.description ||
      error?.message ||
      (typeof error === 'object' ? JSON.stringify(error?.error || error) : String(error));
    logger.error(`[CollectQr] Razorpay QR create failed for order ${order._id}: ${razorpayMessage}`);
    throw new ValidationError(
      error?.message ||
        error?.error?.description ||
        'Failed to create Razorpay QR code',
    );
  }

  const imageUrl = qr?.image_url || qr?.imageUrl || null;
  if (!imageUrl) {
    throw new ValidationError('Razorpay did not return a QR image URL');
  }

  const expiresAt = qr?.close_by ? new Date(Number(qr.close_by) * 1000) : new Date(closeByUnix * 1000);

  // CRITICAL: use upsert so this works even if FoodTransaction was never created at order placement
  const upsertData = {
    $set: {
      paymentMethod: 'razorpay_qr',
      'payment.method': 'razorpay_qr',
      'payment.status': 'pending_qr',
      'payment.amountDue': amountDue,
      'payment.qr': {
        qrId: qr.id,
        imageUrl,
        shortUrl: imageUrl,
        paymentLinkId: '',
        status: qr.status || 'active',
        expiresAt,
      },
    },
    $setOnInsert: {
      orderId: order._id,
      userId: order.userId?._id || order.userId,
      restaurantId: order.restaurantId,
      deliveryPartnerId: order.dispatch?.deliveryPartnerId,
      currency: 'INR',
      status: 'pending',
      pricing: {
        subtotal: order.pricing?.subtotal || 0,
        tax: order.pricing?.tax || 0,
        packagingFee: order.pricing?.packagingFee || 0,
        deliveryFee: order.pricing?.deliveryFee || 0,
        deliveryFeeGst: order.pricing?.deliveryFeeGst || 0,
        platformFee: order.pricing?.platformFee || 0,
        restaurantCommission: order.pricing?.restaurantCommission || 0,
        discount: order.pricing?.discount || 0,
        couponCode: order.pricing?.couponCode ? String(order.pricing.couponCode).trim().toUpperCase() : null,
        total: order.pricing?.total || 0,
        currency: 'INR',
      },
      amounts: {
        totalCustomerPaid: order.pricing?.total || 0,
        restaurantShare: 0, riderShare: 0, restaurantCommission: 0, platformNetProfit: 0,
      },
      history: [{ kind: 'created', amount: amountDue, note: 'Transaction auto-created at QR generation' }],
    },
  };

  await FoodTransaction.updateOne(
    { orderId: order._id },
    upsertData,
    { upsert: true }
  );

  // Also write to FoodOrder so sync can find qrId even without a TX doc
  await FoodOrder.updateOne(
    { _id: order._id },
    {
      $set: {
        'payment.method': 'razorpay_qr',
        'payment.status': 'pending_qr',
        'payment.qr.qrId': qr.id,
        'payment.qr.imageUrl': imageUrl,
        'payment.qr.shortUrl': imageUrl,
        'payment.qr.status': qr.status || 'active',
        'payment.qr.expiresAt': expiresAt,
      }
    }
  );

  const updatedTx = await FoodTransaction.findOne({ orderId: order._id }).lean();


  if (updatedTx) {
    await foodTransactionService.updateTransactionStatus(
      order._id,
      'cod_collect_qr_created',
      {
        recordedByRole: 'DELIVERY_PARTNER',
        recordedById: deliveryPartnerId,
        note: 'COD collection Razorpay QR created',
      },
    );
  }

  enqueueOrderEvent('collect_qr_created', {
    orderMongoId: String(orderId),
    orderId: order?.orderId || null,
    deliveryPartnerId,
    qrId: qr.id,
    imageUrl,
    amountDue,
  });

  return {
    qrId: qr.id,
    imageUrl,
    shortUrl: imageUrl,
    amount: amountDue,
    expiresAt,
  };
}

export async function getPaymentStatus(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError('Order id required');

  // Include payment field so syncRazorpayQrPayment can use it as fallback
  const order = await FoodOrder.findOne(identity).select(
    'dispatch riderEarning platformProfit payment',
  );
  if (!order) throw new NotFoundError('Order not found');
  if (
    order.dispatch?.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()
  ) {
    throw new ForbiddenError('Not your order');
  }

  let transaction = await FoodTransaction.findOne({ orderId: order._id }).lean();
  const effectiveMethod = transaction?.payment?.method || order.payment?.method;
  const hasQr =
    Boolean(transaction?.payment?.qr?.qrId || order.payment?.qr?.qrId) ||
    Boolean(transaction?.payment?.qr?.paymentLinkId || order.payment?.qr?.paymentLinkId);
  
  logger.info(`[getPaymentStatus] order=${order._id} method=${effectiveMethod} txStatus=${transaction?.payment?.status} hasQr=${!!hasQr}`);

  // Sync if this is a QR payment (check both tx and order) and not already paid
  if (effectiveMethod === 'razorpay_qr' && transaction?.payment?.status !== 'paid' && hasQr) {
    await syncRazorpayQrPayment(order);
    // Re-fetch to get the latest status after sync
    transaction = await FoodTransaction.findOne({ orderId: order._id }).lean();
    logger.info(`[getPaymentStatus] After sync: tx.payment.status=${transaction?.payment?.status}`);
  }

  // If no transaction, fall back to FoodOrder.payment
  const paymentData = transaction?.payment || order.payment?.toObject?.() || {};

  const latestHistory =
    (transaction?.history || []).sort((a, b) => (b.at || 0) - (a.at || 0))[0] ||
    null;

  return {
    payment: paymentData,
    latestPaymentSnapshot: latestHistory,
    riderEarning: order.riderEarning ?? 0,
    platformProfit: order.platformProfit ?? 0,
    pricingTotal: transaction?.pricing?.total ?? 0,
    transactionStatus: transaction?.status ?? null,
  };
}



export async function switchToCash(orderId, deliveryPartnerId) {
  const query = mongoose.Types.ObjectId.isValid(orderId)
    ? { _id: orderId }
    : { orderId };

  const order = await FoodOrder.findOne(query).lean();
  if (!order) throw new NotFoundError('Order not found');
  if (order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()) {
    throw new ForbiddenError('Not your order');
  }

  // Only pay-at-delivery orders (legacy COD or QR-collect) may switch to cash.
  const orderPayMethod = String(order.payment?.method || '').toLowerCase();
  if (!['cash', 'razorpay_qr'].includes(orderPayMethod)) {
    throw new ValidationError('Online-paid orders cannot be switched to cash collection');
  }
  if (String(order.payment?.status || '').toLowerCase() === 'paid') {
    throw new ValidationError('Order is already paid');
  }

  // Reset payment method to cash in FoodTransaction
  await FoodTransaction.updateOne(
    { orderId: order._id },
    {
      $set: {
        paymentMethod: 'cash',
        'payment.method': 'cash',
        'payment.status': 'cod_pending',
        'payment.qr': {} // Clear QR info
      }
    }
  );

  await foodTransactionService.updateTransactionStatus(
    order._id,
    'cod_switched_to_cash',
    {
      recordedByRole: 'DELIVERY_PARTNER',
      recordedById: deliveryPartnerId,
      note: 'Rider switched from QR to Cash collection',
    }
  );

  return { success: true };
}
