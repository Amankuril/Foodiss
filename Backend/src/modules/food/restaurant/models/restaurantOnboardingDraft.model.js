import mongoose from 'mongoose';

const restaurantOnboardingDraftSchema = new mongoose.Schema(
    {
        ownerPhone: {
            type: String,
            required: true,
            trim: true,
        },
        ownerPhoneDigits: {
            type: String,
            trim: true,
        },
        ownerPhoneLast10: {
            type: String,
            required: true,
            trim: true,
        },
        currentStep: {
            type: Number,
            min: 1,
            max: 4,
            default: 1,
        },
        completedSteps: {
            type: Number,
            min: 0,
            max: 3,
            default: 0,
        },
        step1: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        step2: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        step3: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        step4: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        expiresAt: {
            type: Date,
            default: null,
        },
    },
    {
        collection: 'food_restaurant_onboarding_drafts',
        timestamps: true,
    }
);

restaurantOnboardingDraftSchema.index(
    { ownerPhoneLast10: 1 },
    { unique: true }
);

// Abandoned drafts auto-expire; expiresAt is refreshed on every save so it
// tracks 10 days from the restaurant's last activity, not creation.
restaurantOnboardingDraftSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

export const FoodRestaurantOnboardingDraft = mongoose.model(
    'FoodRestaurantOnboardingDraft',
    restaurantOnboardingDraftSchema
);
