import { FoodRestaurantOnboardingDraft } from '../models/restaurantOnboardingDraft.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

const MAX_JSON_BYTES = 400_000;

const normalizePhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(-15);
    return {
        digits: digits || '',
        last10: digits ? digits.slice(-10) : '',
    };
};

const isPlainObject = (value) =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sanitizeImageValue = (value) => {
    if (typeof value === 'string') {
        const url = value.trim();
        return url || null;
    }
    if (isPlainObject(value) && typeof value.url === 'string' && value.url.trim()) {
        return {
            url: value.url.trim(),
            publicId: typeof value.publicId === 'string' ? value.publicId : null,
        };
    }
    return null;
};

const sanitizeJsonValue = (value, depth = 0) => {
    if (value == null) return null;
    if (depth > 8) return null;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => sanitizeJsonValue(item, depth + 1))
            .filter((item) => item !== null && item !== undefined)
            .slice(0, 50);
    }

    if (!isPlainObject(value)) return null;

    const looksLikeFile =
        typeof value.size === 'number' &&
        !value.url &&
        (typeof value.name === 'string' || typeof value.type === 'string');
    if (looksLikeFile) return null;

    const out = {};
    for (const [key, nested] of Object.entries(value)) {
        if (key.startsWith('$') || key.includes('.')) continue;
        const cleaned = sanitizeJsonValue(nested, depth + 1);
        if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
};

const sanitizeStepImages = (step, imageKeys = []) => {
    if (!isPlainObject(step)) return step || null;
    const next = { ...step };
    for (const key of imageKeys) {
        if (key === 'menuImages' && Array.isArray(next.menuImages)) {
            next.menuImages = next.menuImages
                .map((img) => sanitizeImageValue(img))
                .filter(Boolean)
                .slice(0, 10);
            continue;
        }
        if (next[key] !== undefined) {
            next[key] = sanitizeImageValue(next[key]);
        }
    }
    return next;
};

const assertPayloadSize = (payload) => {
    let serialized = '';
    try {
        serialized = JSON.stringify(payload);
    } catch {
        throw new ValidationError('Onboarding draft payload is invalid');
    }
    if (serialized.length > MAX_JSON_BYTES) {
        throw new ValidationError('Onboarding draft is too large');
    }
};

const toPublicDraft = (doc) => {
    if (!doc) return null;
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        ownerPhone: raw.ownerPhone || '',
        currentStep: Number(raw.currentStep) || 1,
        completedSteps: Number(raw.completedSteps) || 0,
        step1: raw.step1 || null,
        step2: raw.step2 || null,
        step3: raw.step3 || null,
        step4: raw.step4 || null,
        updatedAt: raw.updatedAt || null,
    };
};

const findDraftByPhone = async (ownerPhone) => {
    const { last10 } = normalizePhone(ownerPhone);
    if (!last10) return null;
    return FoodRestaurantOnboardingDraft.findOne({ ownerPhoneLast10: last10 });
};

const assertNoRegisteredRestaurant = async (ownerPhoneLast10) => {
    if (!ownerPhoneLast10) return;
    const existing = await FoodRestaurant.findOne({
        $or: [
            { ownerPhoneLast10 },
            { ownerPhone: ownerPhoneLast10 },
            { ownerPhoneDigits: { $regex: new RegExp(`${ownerPhoneLast10}$`) } },
        ],
    })
        .select('_id status')
        .lean();

    if (!existing) return;

    if (existing.status === 'pending' || existing.status === 'approved') {
        throw new ValidationError('A restaurant is already registered with this phone number');
    }
};

export const getOnboardingDraftByPhone = async (ownerPhone) => {
    const { last10 } = normalizePhone(ownerPhone);
    if (!last10) {
        throw new ValidationError('Owner phone is required');
    }
    const draft = await findDraftByPhone(last10);
    return toPublicDraft(draft);
};

export const upsertOnboardingDraft = async (payload = {}) => {
    const { digits, last10 } = normalizePhone(payload.ownerPhone);
    if (!last10) {
        throw new ValidationError('Owner phone is required');
    }

    await assertNoRegisteredRestaurant(last10);

    const step1 = sanitizeStepImages(sanitizeJsonValue(payload.step1), []);
    const step2 = sanitizeStepImages(sanitizeJsonValue(payload.step2), ['profileImage', 'menuImages']);
    const step3 = sanitizeStepImages(sanitizeJsonValue(payload.step3), ['panImage', 'gstImage', 'fssaiImage']);
    const step4 = sanitizeJsonValue(payload.step4);

    const nextCurrentStep = Math.min(4, Math.max(1, Number(payload.currentStep) || 1));
    const nextCompletedSteps = Math.min(3, Math.max(0, Number(payload.completedSteps) || 0));

    const update = {
        ownerPhone: digits || last10,
        ownerPhoneDigits: digits || last10,
        ownerPhoneLast10: last10,
        currentStep: nextCurrentStep,
        completedSteps: nextCompletedSteps,
    };
    if (payload.step1 !== undefined) update.step1 = step1;
    if (payload.step2 !== undefined) update.step2 = step2;
    if (payload.step3 !== undefined) update.step3 = step3;
    if (payload.step4 !== undefined) update.step4 = step4;

    assertPayloadSize(update);

    const draft = await FoodRestaurantOnboardingDraft.findOneAndUpdate(
        { ownerPhoneLast10: last10 },
        { $set: update },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return toPublicDraft(draft);
};

export const deleteOnboardingDraftByPhone = async (ownerPhone) => {
    const { last10 } = normalizePhone(ownerPhone);
    if (!last10) return false;
    const result = await FoodRestaurantOnboardingDraft.deleteOne({ ownerPhoneLast10: last10 });
    return result.deletedCount > 0;
};
