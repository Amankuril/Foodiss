import mongoose from 'mongoose';

// Collection name kept as-is to avoid any DB rename/migration.
const restaurantOnboardingSettingsSchema = new mongoose.Schema(
    {
        onboardingFee: { type: Number, required: true, default: 0, min: 0 },
    },
    { collection: 'food_restaurant_subscription_settings', timestamps: true }
);

export const FoodRestaurantOnboardingSettings = mongoose.model(
    'FoodRestaurantOnboardingSettings',
    restaurantOnboardingSettingsSchema
);
