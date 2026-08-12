import mongoose from 'mongoose';

const zoneDeliverySurgeSchema = new mongoose.Schema(
    {
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            required: true,
            unique: true,
            index: true,
        },
        surgeType: {
            type: String,
            enum: ['percentage', 'flat'],
            required: true,
        },
        surgeValue: {
            type: Number,
            required: true,
            min: 0,
        },
        isEnabled: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        collection: 'food_zone_delivery_surges',
        timestamps: true,
    },
);

zoneDeliverySurgeSchema.index({ isEnabled: 1, zoneId: 1 });

export const FoodZoneDeliverySurge = mongoose.model('FoodZoneDeliverySurge', zoneDeliverySurgeSchema);
