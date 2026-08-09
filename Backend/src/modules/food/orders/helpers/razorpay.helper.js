import crypto from 'crypto';

let Razorpay;
try {
    const mod = await import('razorpay');
    Razorpay = mod.default;
} catch {
    Razorpay = null;
}

import { config } from '../../../../config/env.js';

const KEY_ID = config.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '';

export function isRazorpayConfigured() {
    return Boolean(KEY_ID && KEY_SECRET && Razorpay);
}

export function getRazorpayKeyId() {
    return KEY_ID;
}

export function getRazorpayInstance() {
    if (!isRazorpayConfigured()) return null;
    return new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
}

export function createRazorpayOrder(amountPaise, currency = 'INR', receipt = '') {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.orders.create({
        amount: Math.round(amountPaise),
        currency,
        receipt: receipt || undefined
    });
}

export function createPaymentLink({ amountPaise, currency = 'INR', description, orderId, customerName, customerEmail, customerPhone }) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));
    return instance.paymentLink.create({
        amount: Math.round(amountPaise),
        currency,
        description: description || `Order ${orderId}`,
        customer: {
            name: customerName || 'Customer',
            email: customerEmail || 'customer@example.com',
            contact: customerPhone ? String(customerPhone).replace(/\D/g, '').slice(-10) : '9999999999'
        }
    });
}

/**
 * Create a Razorpay Dynamic UPI QR Code (QR Codes API).
 * Response includes `image_url` — Razorpay's hosted QR image to show directly.
 * Works with BOTH test (`rzp_test_…`) and live (`rzp_live_…`) keys, but the
 * QR Codes product must be enabled for that mode in Razorpay Dashboard.
 * @see https://razorpay.com/docs/api/qr-codes/create/
 */
export async function createRazorpayQrCode({
    amountPaise,
    name,
    description,
    orderId,
    closeByUnix,
    notes = {},
}) {
    const instance = getRazorpayInstance();
    if (!instance) return Promise.reject(new Error('Razorpay not configured'));

    const amount = Math.round(Number(amountPaise) || 0);
    if (!Number.isFinite(amount) || amount < 100) {
        return Promise.reject(new Error('QR amount must be at least ₹1'));
    }

    // Razorpay requires close_by to be at least 15 minutes from now.
    const minCloseBy = Math.floor(Date.now() / 1000) + 15 * 60;
    const closeBy = Math.max(Number(closeByUnix) || 0, minCloseBy);

    const stringNotes = Object.fromEntries(
        Object.entries({
            orderId: String(orderId || ''),
            purpose: 'cod_collect',
            ...notes,
        })
            .filter(([, value]) => value != null && String(value).trim() !== '')
            .map(([key, value]) => [key, String(value).slice(0, 256)])
            .slice(0, 15)
    );

    try {
        return await instance.qrCode.create({
            type: 'upi_qr',
            name: String(name || `Order ${orderId || ''}`).slice(0, 40) || 'COD Collect',
            usage: 'single_use',
            fixed_amount: true,
            payment_amount: amount,
            description: String(description || `Order ${orderId} COD collect`).slice(0, 255),
            close_by: closeBy,
            notes: stringNotes,
        });
    } catch (error) {
        const descriptionText = String(
            error?.error?.description || error?.description || error?.message || ''
        ).trim();
        const normalized = descriptionText.toLowerCase();
        const featureMissing =
            normalized.includes('requested url was not found') ||
            normalized.includes('not enabled') ||
            normalized.includes('access denied');

        if (featureMissing) {
            const mode = String(KEY_ID || '').startsWith('rzp_live') ? 'Live' : 'Test';
            const err = new Error(
                `Razorpay QR Codes is not enabled for ${mode} mode. ` +
                    `In Razorpay Dashboard → Payment Products → QR Codes, enable QR Codes ` +
                    `(same mode as your key: ${mode}). ` +
                    `API works with test and live keys once enabled; real UPI scan works in Live mode.`
            );
            err.statusCode = error?.statusCode || 400;
            err.error = error?.error || { description: err.message };
            err.cause = error;
            throw err;
        }

        const err = new Error(descriptionText || 'Failed to create Razorpay QR code');
        err.statusCode = error?.statusCode || 400;
        err.error = error?.error || { description: err.message };
        err.cause = error;
        throw err;
    }
}

/**
 * Fetch a Razorpay QR Code by id (used to verify COD QR payment status).
 */
export async function fetchRazorpayQrCode(qrCodeId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!qrCodeId) throw new Error('qrCodeId is required');
    return instance.qrCode.fetch(String(qrCodeId));
}

/**
 * Fetch payments received against a Razorpay QR Code.
 */
export async function fetchRazorpayQrPayments(qrCodeId, options = {}) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!qrCodeId) throw new Error('qrCodeId is required');
    return instance.qrCode.fetchAllPayments(String(qrCodeId), options);
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
    if (!KEY_SECRET) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', KEY_SECRET).update(body).digest('hex');
    return expected === signature;
}

/**
 * Fetch Razorpay payment (server-side) for additional validation (amount/status/order match).
 * @param {string} paymentId
 */
export async function fetchRazorpayPayment(paymentId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentId) throw new Error('paymentId is required');
    return instance.payments.fetch(String(paymentId));
}

/**
 * Fetch Razorpay payment-link to check status (used for Razorpay QR auto verification).
 * @param {string} paymentLinkId
 */
export async function fetchRazorpayPaymentLink(paymentLinkId) {
    const instance = getRazorpayInstance();
    if (!instance) throw new Error('Razorpay not configured');
    if (!paymentLinkId) throw new Error('paymentLinkId is required');
    return instance.paymentLink.fetch(String(paymentLinkId));
}

/**
 * ✅ NEW: Initiate a refund for a successful payment.
 * NON-BREAKING Extension for automated cancellation refunds.
 * @param {string} paymentId - Original Razorpay payment_id (captured)
 * @param {number} amount - Amount to refund (in major unit, e.g., INR 123.45)
 */
export async function initiateRazorpayRefund(paymentId, amount) {
    if (!isRazorpayConfigured()) {
        throw new Error('Razorpay is not configured on this server');
    }
    const instance = getRazorpayInstance();
    try {
        const refund = await instance.payments.refund(paymentId, {
            amount: Math.round(Number(amount) * 100), // convert to paise
            notes: {
                reason: 'Order cancelled by system flow',
                at: new Date().toISOString()
            }
        });
        return {
            success: true,
            refundId: refund.id,
            status: refund.status || 'processed',
            raw: refund
        };
    } catch (err) {
        // Log locally but pass the error to the service to handle status update
        console.error(`Razorpay Refund API Failure [PaymentId: ${paymentId}]:`, err?.message || err);
        return {
            success: false,
            error: err?.message || 'Razorpay refund API error',
            status: 'failed'
        };
    }
}
