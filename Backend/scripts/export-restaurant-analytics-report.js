/**
 * Read-only restaurant analytics export.
 * Generates a multi-sheet Excel workbook — does NOT modify the database.
 *
 * Usage:
 *   node scripts/export-restaurant-analytics-report.js
 *   node scripts/export-restaurant-analytics-report.js --status approved
 *   node scripts/export-restaurant-analytics-report.js --output ./reports/my-report.xlsx
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';

import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import '../src/modules/food/orders/models/foodTransaction.model.js';
import { isCancelledOrder, CANCELLED_ORDER_STATUSES } from '../src/modules/food/orders/services/order.helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const IST = 'Asia/Kolkata';

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (v) => Math.round(toNum(v, 0) * 100) / 100;

const formatDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { timeZone: IST });
};

const monthKeyFromDate = (d) => {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return year && month ? `${year}-${month}` : null;
};

const parseArgs = () => {
  const raw = process.argv.slice(2);
  const args = { status: 'all' };
  for (let i = 0; i < raw.length; i += 1) {
    const key = raw[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = raw[i + 1];
  }
  return args;
};

const getTransactionDoc = (order) => {
  const tx = order?.transactionId;
  return tx && typeof tx === 'object' ? tx : {};
};

const isEarnedOrder = (order) => {
  if (isCancelledOrder(order)) return false;
  const orderStatus = String(order?.orderStatus || order?.status || '').trim().toLowerCase();
  const deliveryPhase = String(order?.deliveryState?.currentPhase || '').trim().toLowerCase();
  return (
    orderStatus === 'delivered' ||
    deliveryPhase === 'delivered' ||
    deliveryPhase === 'completed'
  );
};

const calculateOrderPayout = (order) => {
  if (!isEarnedOrder(order)) return 0;

  const tx = getTransactionDoc(order);
  const pricing = tx.pricing || order?.pricing || {};
  const amounts = tx.amounts || {};
  const storedRestaurantShare = Number(amounts.restaurantShare);
  if (Number.isFinite(storedRestaurantShare)) {
    return Math.max(0, storedRestaurantShare);
  }

  const subtotal = Number(pricing.subtotal) || 0;
  const packagingFee = Number(pricing.packagingFee) || 0;
  const commission = Number(amounts.restaurantCommission) || Number(pricing.restaurantCommission) || 0;
  const restaurantDiscountShare = Number(amounts.restaurantDiscountShare) || 0;
  return Math.max(0, subtotal + packagingFee - commission - restaurantDiscountShare);
};

const calculateCustomerGmv = (order) => {
  if (!isEarnedOrder(order)) return 0;

  const tx = getTransactionDoc(order);
  const pricing = tx.pricing || order?.pricing || {};
  const amounts = tx.amounts || {};
  const fromTx = Number(amounts.totalCustomerPaid);
  if (Number.isFinite(fromTx) && fromTx > 0) return fromTx;
  return Math.max(0, Number(pricing.total) || 0);
};

const styleHeaderRow = (sheet) => {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' },
  };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 22;
};

const autoFitColumns = (sheet, minWidth = 12, maxWidth = 42) => {
  sheet.columns.forEach((col) => {
    let maxLen = String(col.header || '').length;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxWidth, Math.max(minWidth, maxLen + 2));
  });
};

const generateMonthRange = (startMonthKey, endMonthKey) => {
  if (!startMonthKey || !endMonthKey) return [];
  const [sy, sm] = startMonthKey.split('-').map(Number);
  const [ey, em] = endMonthKey.split('-').map(Number);
  const months = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
};

const fetchRestaurants = async (statusFilter) => {
  const query = {};
  if (statusFilter && statusFilter !== 'all') {
    query.status = statusFilter;
  }
  return FoodRestaurant.find(query)
    .select(
      'restaurantName ownerName ownerPhone ownerEmail status createdAt approvedAt city state onboardingFeePaid onboardingFeeAmount'
    )
    .sort({ createdAt: 1 })
    .lean();
};

const fetchAllOrders = async () => {
  return FoodOrder.find({ orderStatus: { $nin: ['pending_payment'] } })
    .populate('transactionId')
    .select('restaurantId orderStatus status deliveryState pricing createdAt transactionId')
    .lean();
};

const fetchWithdrawalStats = async () => {
  const rows = await mongoose.connection.db.collection('food_restaurant_withdrawals').aggregate([
    {
      $group: {
        _id: '$restaurantId',
        withdrawnAmount: {
          $sum: {
            $cond: [{ $eq: [{ $toLower: { $trim: { input: { $ifNull: ['$status', ''] } } } }, 'approved'] }, '$amount', 0],
          },
        },
        pendingWithdrawal: {
          $sum: {
            $cond: [{ $eq: [{ $toLower: { $trim: { input: { $ifNull: ['$status', ''] } } } }, 'pending'] }, '$amount', 0],
          },
        },
      },
    },
  ]).toArray();

  const map = new Map();
  for (const row of rows) {
    map.set(String(row._id), row);
  }
  return map;
};

const buildFinanceFromOrders = (orders) => {
  const lifetimeMap = new Map();
  const monthlyMap = new Map();
  const orderStatsMap = new Map();

  for (const order of orders) {
    const restaurantId = String(order.restaurantId || '');
    if (!restaurantId) continue;

    if (!orderStatsMap.has(restaurantId)) {
      orderStatsMap.set(restaurantId, { totalOrders: 0, completedOrders: 0, cancelledOrders: 0 });
    }
    const stats = orderStatsMap.get(restaurantId);
    stats.totalOrders += 1;

    const statusNormalized = String(order.orderStatus || order.status || '').trim().toLowerCase();
    if (CANCELLED_ORDER_STATUSES.includes(statusNormalized)) {
      stats.cancelledOrders += 1;
    }
    if (isEarnedOrder(order)) {
      stats.completedOrders += 1;
    }

    if (!isEarnedOrder(order)) continue;

    const payout = calculateOrderPayout(order);
    const customerGmv = calculateCustomerGmv(order);

    if (!lifetimeMap.has(restaurantId)) {
      lifetimeMap.set(restaurantId, {
        lifetimeGmv: 0,
        lifetimeEarnings: 0,
        lifetimeCustomerGmv: 0,
        completedOrderCount: 0,
      });
    }
    const lifetime = lifetimeMap.get(restaurantId);
    lifetime.lifetimeGmv += payout;
    lifetime.lifetimeEarnings += payout;
    lifetime.lifetimeCustomerGmv += customerGmv;
    lifetime.completedOrderCount += 1;

    const monthKey = monthKeyFromDate(order.createdAt);
    if (!monthKey) continue;
    const monthlyKey = `${restaurantId}::${monthKey}`;
    if (!monthlyMap.has(monthlyKey)) {
      monthlyMap.set(monthlyKey, { restaurantGmv: 0, customerGmv: 0, orderCount: 0 });
    }
    const monthly = monthlyMap.get(monthlyKey);
    monthly.restaurantGmv += payout;
    monthly.customerGmv += customerGmv;
    monthly.orderCount += 1;
  }

  return { lifetimeMap, monthlyMap, orderStatsMap };
};

const buildWorkbook = async ({
  restaurants,
  orderStatsMap,
  lifetimeMap,
  monthlyMap,
  withdrawalMap,
  statusFilter,
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Appzeto Restaurant Analytics Export';
  workbook.created = new Date();

  const currentMonthKey = monthKeyFromDate(new Date());
  let grandLifetimeEarnings = 0;
  let grandLifetimeGmv = 0;
  let grandCustomerGmv = 0;
  let grandTotalOrders = 0;
  let grandCompletedOrders = 0;
  let grandWithdrawn = 0;

  const restaurantRows = restaurants.map((r) => {
    const id = String(r._id);
    const orderStats = orderStatsMap.get(id) || {};
    const finance = lifetimeMap.get(id) || {};
    const withdrawals = withdrawalMap.get(id) || {};
    const lifetimeGmv = round2(finance.lifetimeGmv);
    const lifetimeEarnings = round2(finance.lifetimeEarnings);
    const customerGmv = round2(finance.lifetimeCustomerGmv);
    const withdrawnAmount = round2(withdrawals.withdrawnAmount);
    const pendingWithdrawal = round2(withdrawals.pendingWithdrawal);
    const totalOrders = toNum(orderStats.totalOrders, 0);
    const completedOrders = toNum(orderStats.completedOrders, 0);

    grandLifetimeGmv += lifetimeGmv;
    grandLifetimeEarnings += lifetimeEarnings;
    grandCustomerGmv += customerGmv;
    grandTotalOrders += totalOrders;
    grandCompletedOrders += completedOrders;
    grandWithdrawn += withdrawnAmount;

    return {
      id,
      restaurant: r,
      lifetimeGmv,
      lifetimeEarnings,
      customerGmv,
      withdrawnAmount,
      pendingWithdrawal,
      totalOrders,
      completedOrders,
      cancelledOrders: toNum(orderStats.cancelledOrders, 0),
      joinMonthKey: monthKeyFromDate(r.createdAt),
    };
  });

  // Sheet 1: Overview
  const overview = workbook.addWorksheet('Overview');
  overview.columns = [
    { header: 'Metric', key: 'metric', width: 42 },
    { header: 'Value', key: 'value', width: 30 },
  ];
  styleHeaderRow(overview);
  const overviewData = [
    { metric: 'Report Generated At (IST)', value: formatDateTime(new Date()) },
    { metric: 'Restaurant Filter', value: statusFilter === 'all' ? 'All statuses' : statusFilter },
    { metric: 'Total Restaurants', value: restaurants.length },
    { metric: 'Approved Restaurants', value: restaurants.filter((r) => r.status === 'approved').length },
    { metric: 'Pending Restaurants', value: restaurants.filter((r) => r.status === 'pending').length },
    { metric: 'Rejected Restaurants', value: restaurants.filter((r) => r.status === 'rejected').length },
    { metric: 'Grand Total Orders', value: grandTotalOrders },
    { metric: 'Grand Completed Orders', value: grandCompletedOrders },
    { metric: 'Grand Lifetime GMV / Earnings (INR)', value: round2(grandLifetimeGmv) },
    { metric: 'Grand Lifetime Customer GMV (INR)', value: round2(grandCustomerGmv) },
    { metric: 'Grand Withdrawn Amount (INR)', value: round2(grandWithdrawn) },
    {
      metric: 'GMV / Earnings Definition',
      value: 'Calculated from delivered/completed orders. Uses transaction restaurantShare when available, otherwise order pricing payout formula.',
    },
    {
      metric: 'Lifetime Earnings Note',
      value: 'Total gross payout from all completed orders. NOT reduced by withdrawals — withdrawn amount is shown separately.',
    },
    { metric: 'Monthly GMV Note', value: 'Calendar months in IST from join month through current month. Partial join month includes full month orders.' },
  ];
  overviewData.forEach((row) => overview.addRow(row));

  // Sheet 2: All Restaurants
  const allRestaurants = workbook.addWorksheet('All Restaurants');
  allRestaurants.columns = [
    { header: 'S.No', key: 'sno', width: 8 },
    { header: 'Restaurant ID', key: 'id', width: 26 },
    { header: 'Restaurant Name', key: 'name', width: 30 },
    { header: 'Owner Name', key: 'ownerName', width: 22 },
    { header: 'Owner Phone', key: 'ownerPhone', width: 16 },
    { header: 'Owner Email', key: 'ownerEmail', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'State', key: 'state', width: 14 },
    { header: 'Joining Date (IST)', key: 'joinDate', width: 18 },
    { header: 'Approved Date (IST)', key: 'approvedAt', width: 20 },
    { header: 'Total Orders', key: 'totalOrders', width: 14 },
    { header: 'Completed Orders', key: 'completedOrders', width: 16 },
    { header: 'Cancelled Orders', key: 'cancelledOrders', width: 16 },
    { header: 'Lifetime GMV (INR)', key: 'lifetimeGmv', width: 20 },
    { header: 'Lifetime Earnings (INR)', key: 'lifetimeEarnings', width: 22 },
    { header: 'Withdrawn Amount (INR)', key: 'withdrawnAmount', width: 22 },
    { header: 'Pending Withdrawal (INR)', key: 'pendingWithdrawal', width: 22 },
    { header: 'Lifetime Customer GMV (INR)', key: 'customerGmv', width: 24 },
    { header: 'Onboarding Fee Paid', key: 'onboardingFeePaid', width: 18 },
    { header: 'Onboarding Fee (INR)', key: 'onboardingFeeAmount', width: 18 },
  ];
  styleHeaderRow(allRestaurants);

  restaurantRows.forEach((row, idx) => {
    const r = row.restaurant;
    allRestaurants.addRow({
      sno: idx + 1,
      id: row.id,
      name: r.restaurantName || '',
      ownerName: r.ownerName || '',
      ownerPhone: r.ownerPhone || '',
      ownerEmail: r.ownerEmail || '',
      status: r.status || '',
      city: r.city || '',
      state: r.state || '',
      joinDate: formatDate(r.createdAt),
      approvedAt: formatDate(r.approvedAt),
      totalOrders: row.totalOrders,
      completedOrders: row.completedOrders,
      cancelledOrders: row.cancelledOrders,
      lifetimeGmv: row.lifetimeGmv,
      lifetimeEarnings: row.lifetimeEarnings,
      withdrawnAmount: row.withdrawnAmount,
      pendingWithdrawal: row.pendingWithdrawal,
      customerGmv: row.customerGmv,
      onboardingFeePaid: r.onboardingFeePaid ? 'Yes' : 'No',
      onboardingFeeAmount: round2(r.onboardingFeeAmount),
    });
  });
  autoFitColumns(allRestaurants);

  // Sheet 3: Monthly GMV (wide format — one column per month)
  const allMonthKeys = new Set();
  for (const row of restaurantRows) {
    const months = generateMonthRange(row.joinMonthKey, currentMonthKey);
    months.forEach((m) => allMonthKeys.add(m));
  }
  const sortedMonthKeys = [...allMonthKeys].sort();

  const monthlyWide = workbook.addWorksheet('Monthly GMV (Wide)');
  const wideHeaders = [
    { header: 'Restaurant ID', key: 'id', width: 26 },
    { header: 'Restaurant Name', key: 'name', width: 30 },
    { header: 'Joining Date', key: 'joinDate', width: 16 },
    { header: 'Join Month', key: 'joinMonth', width: 12 },
    ...sortedMonthKeys.map((m) => ({ header: `${m} GMV`, key: `gmv_${m}`, width: 14 })),
    { header: 'Total GMV', key: 'totalGmv', width: 14 },
  ];
  monthlyWide.columns = wideHeaders;
  styleHeaderRow(monthlyWide);

  for (const row of restaurantRows) {
    const r = row.restaurant;
    const wideRow = {
      id: row.id,
      name: r.restaurantName || '',
      joinDate: formatDate(r.createdAt),
      joinMonth: row.joinMonthKey || '',
      totalGmv: 0,
    };
    const months = generateMonthRange(row.joinMonthKey, currentMonthKey);
    for (const month of months) {
      const data = monthlyMap.get(`${row.id}::${month}`);
      const gmv = round2(data?.restaurantGmv);
      wideRow[`gmv_${month}`] = gmv;
      wideRow.totalGmv = round2(wideRow.totalGmv + gmv);
    }
    monthlyWide.addRow(wideRow);
  }
  autoFitColumns(monthlyWide);

  // Sheet 4: Monthly GMV (long format — easier to filter/pivot)
  const monthlyLong = workbook.addWorksheet('Monthly GMV (Detail)');
  monthlyLong.columns = [
    { header: 'Restaurant ID', key: 'id', width: 26 },
    { header: 'Restaurant Name', key: 'name', width: 30 },
    { header: 'Joining Date', key: 'joinDate', width: 16 },
    { header: 'Month (YYYY-MM)', key: 'month', width: 14 },
    { header: 'Restaurant GMV (INR)', key: 'restaurantGmv', width: 20 },
    { header: 'Customer GMV (INR)', key: 'customerGmv', width: 20 },
    { header: 'Completed Orders', key: 'orderCount', width: 16 },
    { header: 'Is Join Month', key: 'isJoinMonth', width: 14 },
  ];
  styleHeaderRow(monthlyLong);

  for (const row of restaurantRows) {
    const r = row.restaurant;
    const months = generateMonthRange(row.joinMonthKey, currentMonthKey);
    for (const month of months) {
      const data = monthlyMap.get(`${row.id}::${month}`);
      monthlyLong.addRow({
        id: row.id,
        name: r.restaurantName || '',
        joinDate: formatDate(r.createdAt),
        month,
        restaurantGmv: round2(data?.restaurantGmv),
        customerGmv: round2(data?.customerGmv),
        orderCount: toNum(data?.orderCount, 0),
        isJoinMonth: month === row.joinMonthKey ? 'Yes' : 'No',
      });
    }
  }
  autoFitColumns(monthlyLong);

  return workbook;
};

const main = async () => {
  const args = parseArgs();
  const statusFilter = String(args.status || 'all').trim().toLowerCase();

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI / MONGODB_URI missing in Backend/.env');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultOutput = path.join(__dirname, `../reports/restaurant-analytics-${timestamp}.xlsx`);
  const outputPath = path.resolve(args.output || defaultOutput);

  console.log('Connecting to MongoDB (read-only)...');
  await mongoose.connect(mongoUri);

  try {
    console.log('Fetching restaurants...');
    const restaurants = await fetchRestaurants(statusFilter);
    console.log(`Found ${restaurants.length} restaurants (filter: ${statusFilter})`);

    console.log('Fetching orders and computing finance from order data...');
    const [orders, withdrawalMap] = await Promise.all([
      fetchAllOrders(),
      fetchWithdrawalStats(),
    ]);
    const { lifetimeMap, monthlyMap, orderStatsMap } = buildFinanceFromOrders(orders);
    console.log(`Processed ${orders.length} orders`);

    console.log('Building Excel workbook...');
    const workbook = await buildWorkbook({
      restaurants,
      orderStatsMap,
      lifetimeMap,
      monthlyMap,
      withdrawalMap,
      statusFilter,
    });

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await workbook.xlsx.writeFile(outputPath);

    console.log('\n=== EXPORT COMPLETE ===');
    console.log(`File: ${outputPath}`);
    console.log(`Restaurants: ${restaurants.length}`);
    console.log('Database was NOT modified.');
  } finally {
    await mongoose.connection.close();
  }
};

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
