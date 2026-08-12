import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const upsertSchema = z.object({
    zoneId: z.string().min(1, 'Zone is required'),
    surgeType: z.enum(['percentage', 'flat']),
    surgeValue: z.number().min(0),
    isEnabled: z.boolean().optional(),
});

export function validateZoneDeliverySurgeUpsertDto(body = {}) {
    const normalized = {
        zoneId: body?.zoneId != null ? String(body.zoneId).trim() : '',
        surgeType: body?.surgeType != null ? String(body.surgeType).trim() : '',
        surgeValue: body?.surgeValue != null ? Number(body.surgeValue) : NaN,
        isEnabled: body?.isEnabled !== undefined ? Boolean(body.isEnabled) : undefined,
    };

    const result = upsertSchema.safeParse(normalized);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0]?.message || 'Invalid surge payload');
    }

    if (result.data.surgeType === 'percentage' && result.data.surgeValue > 100) {
        throw new ValidationError('Percentage surge cannot exceed 100');
    }

    return result.data;
}
