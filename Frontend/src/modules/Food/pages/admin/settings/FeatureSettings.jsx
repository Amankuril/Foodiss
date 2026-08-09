import React, { useEffect, useMemo, useState } from 'react';
import { adminAPI } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@food/components/ui/card';
import { Button } from '@food/components/ui/button';
import { Switch } from '@food/components/ui/switch';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { invalidatePublicAppConfig } from '@food/services/publicAppConfig';
import { GOOGLE_DISTANCE_FEATURE_KEYS } from '@food/utils/googleDistanceFeatures';

const FEATURE_KEYS = {
    COD_CONTROL: 'cod_control',
    ADMIN_ACCESS_SECTION: 'admin_access_section',
    ROOT_LANDING_AND_UNREGISTERED_CONTROL: 'root_landing_and_unregistered_control',
    GOOGLE_HOME_ROAD_DISTANCE: GOOGLE_DISTANCE_FEATURE_KEYS.HOME_ROAD_DISTANCE,
    GOOGLE_ORDER_ROAD_DISTANCE: GOOGLE_DISTANCE_FEATURE_KEYS.ORDER_ROAD_DISTANCE,
};

export default function FeatureSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [features, setFeatures] = useState([]);

    const codControl = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.COD_CONTROL) || null,
        [features]
    );

    const adminAccessSection = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.ADMIN_ACCESS_SECTION) || null,
        [features]
    );

    const rootLandingAndUnregisteredControl = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.ROOT_LANDING_AND_UNREGISTERED_CONTROL) || null,
        [features]
    );

    const googleHomeRoadDistance = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.GOOGLE_HOME_ROAD_DISTANCE) || null,
        [features]
    );

    const googleOrderRoadDistance = useMemo(
        () => features.find((item) => item.key === FEATURE_KEYS.GOOGLE_ORDER_ROAD_DISTANCE) || null,
        [features]
    );

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const res = await adminAPI.getFeatureSettings();
                const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
                setFeatures(rows);
            } catch (error) {
                toast.error('Failed to load feature settings.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const setToggle = (key, checked) => {
        setFeatures((prev) =>
            prev.map((row) =>
                row.key === key ? { ...row, isEnabled: Boolean(checked) } : row
            )
        );
    };

    const handleSave = async () => {
        const updates = [
            codControl,
            adminAccessSection,
            rootLandingAndUnregisteredControl,
            googleHomeRoadDistance,
            googleOrderRoadDistance,
        ].filter(Boolean);
        if (updates.length === 0) return;
        try {
            setSaving(true);
            await Promise.all(
                updates.map((feature) =>
                    adminAPI.updateFeatureSetting(feature.key, {
                        isEnabled: Boolean(feature.isEnabled)
                    })
                )
            );
            updates.forEach((feature) => {
                window.dispatchEvent(new CustomEvent('adminFeatureSettingUpdated', {
                    detail: {
                        key: feature.key,
                        isEnabled: Boolean(feature.isEnabled)
                    }
                }));
            });
            invalidatePublicAppConfig();
            toast.success('Feature setting updated successfully.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to update feature setting.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[320px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Feature Settings</h1>
                <p className="text-sm text-gray-500 mt-1">Enable or disable platform features safely from one place.</p>
            </div>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg">Cash On Delivery (COD)</CardTitle>
                    <CardDescription>
                        Controls COD visibility on user checkout and delivery cash-limit related sections in delivery/admin panels.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {codControl?.isEnabled
                            ? 'Enabled: COD and cash-limit sections are visible'
                            : 'Disabled: COD and cash-limit sections are hidden'}
                    </div>
                    <Switch
                        checked={Boolean(codControl?.isEnabled)}
                        onCheckedChange={(checked) => setToggle(FEATURE_KEYS.COD_CONTROL, checked)}
                    />
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg">Admin Access Section</CardTitle>
                    <CardDescription>
                        Controls visibility of the Admin Access sidebar section, including Sub Admin List.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {adminAccessSection?.isEnabled
                            ? 'Enabled: Admin Access section is visible'
                            : 'Disabled: Admin Access section is hidden'}
                    </div>
                    <Switch
                        checked={Boolean(adminAccessSection?.isEnabled)}
                        onCheckedChange={(checked) => setToggle(FEATURE_KEYS.ADMIN_ACCESS_SECTION, checked)}
                    />
                </CardContent>
            </Card>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-lg">Root Landing & Unregistered Restaurants</CardTitle>
                    <CardDescription>
                        Controls root URL and Unregistered Restaurants visibility. OFF redirects root (/) to /food/user and hides Unregistered Restaurants.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {rootLandingAndUnregisteredControl?.isEnabled
                            ? 'Enabled: root opens Landing Page and Unregistered Restaurants is visible'
                            : 'Disabled: root redirects to /food/user and Unregistered Restaurants is hidden'}
                    </div>
                    <Switch
                        checked={Boolean(rootLandingAndUnregisteredControl?.isEnabled)}
                        onCheckedChange={(checked) => setToggle(FEATURE_KEYS.ROOT_LANDING_AND_UNREGISTERED_CONTROL, checked)}
                    />
                </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/40">
                <CardHeader>
                    <CardTitle className="text-lg">Google Home / List Road Distance</CardTitle>
                    <CardDescription>
                        Highest Maps cost. When ON, Home and restaurant detail pages call Google Distance Matrix / Directions for road-km labels.
                        When OFF, straight-line (Haversine) distance is shown instead.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {googleHomeRoadDistance?.isEnabled
                            ? 'Enabled: Google road distance on Home / restaurant details'
                            : 'Disabled: Haversine only on Home / restaurant details (saves Distance Matrix bill)'}
                    </div>
                    <Switch
                        checked={Boolean(googleHomeRoadDistance?.isEnabled)}
                        onCheckedChange={(checked) => setToggle(FEATURE_KEYS.GOOGLE_HOME_ROAD_DISTANCE, checked)}
                    />
                </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/40">
                <CardHeader>
                    <CardTitle className="text-lg">Google Order / Pricing Road Distance</CardTitle>
                    <CardDescription>
                        When ON, cart pricing, dispatch trip km, accept polyline, and related client order flows use Google Directions.
                        When OFF, fees and trip distance use Haversine and Google route calls are skipped.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                    <div className="text-sm text-gray-700">
                        {googleOrderRoadDistance?.isEnabled
                            ? 'Enabled: Google Directions for order pricing / dispatch / accept'
                            : 'Disabled: Haversine for order fees / trip distance (saves Directions bill)'}
                    </div>
                    <Switch
                        checked={Boolean(googleOrderRoadDistance?.isEnabled)}
                        onCheckedChange={(checked) => setToggle(FEATURE_KEYS.GOOGLE_ORDER_ROAD_DISTANCE, checked)}
                    />
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={
                        saving ||
                        (!codControl &&
                            !adminAccessSection &&
                            !rootLandingAndUnregisteredControl &&
                            !googleHomeRoadDistance &&
                            !googleOrderRoadDistance)
                    }
                >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
