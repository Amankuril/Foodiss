import { useEffect, useMemo, useState } from "react"
import { MapPin, Plus, Search, Edit, Trash2, Zap } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { Switch } from "@food/components/ui/switch"
import { adminAPI } from "@food/api"
import { formatDeliverySurgeLabel } from "@food/utils/deliveryFeeDisplay"
import { toast } from "sonner"

const emptyForm = {
  zoneId: "",
  surgeType: "flat",
  surgeValue: "",
  isEnabled: true,
}

const fieldClassName =
  "w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"

function StatusSwitch({ enabled, onToggle, disabled = false, size = "md" }) {
  const isSm = size === "sm"
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex shrink-0 items-center rounded-full border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-60 ${
        isSm ? "h-6 w-11" : "h-7 w-12"
      } ${
        enabled
          ? "border-orange-500 bg-orange-500"
          : "border-slate-300 bg-slate-200"
      }`}
    >
      <span
        className={`inline-block rounded-full bg-white shadow-md transition-transform duration-200 ${
          isSm ? "h-4 w-4" : "h-5 w-5"
        } ${enabled ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  )
}

export default function DeliveryZoneSurge() {
  const [searchQuery, setSearchQuery] = useState("")
  const [items, setItems] = useState([])
  const [availableZones, setAvailableZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedSurgeId, setSelectedSurgeId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [togglingId, setTogglingId] = useState(null)

  const fetchSurges = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getZoneDeliverySurges(
        searchQuery.trim() ? { search: searchQuery.trim() } : {},
      )
      if (response.data?.success) {
        setItems(response.data.data?.items || [])
        setAvailableZones(response.data.data?.availableZones || [])
      } else {
        toast.error(response.data?.message || "Failed to load zone surges")
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load zone surges")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSurges()
  }, [])

  const filteredItems = useMemo(() => {
    const term = searchQuery.trim().toLowerCase()
    if (!term) return items
    return items.filter((row) => {
      const zone = row?.zone || {}
      const haystack = [
        zone.name,
        zone.zoneName,
        zone.serviceLocation,
        zone.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [items, searchQuery])

  const resetDialog = () => {
    setDialogOpen(false)
    setIsEditMode(false)
    setSelectedSurgeId(null)
    setFormData(emptyForm)
  }

  const openCreateDialog = () => {
    setIsEditMode(false)
    setSelectedSurgeId(null)
    setFormData({
      ...emptyForm,
      zoneId: availableZones[0]?._id ? String(availableZones[0]._id) : "",
    })
    setDialogOpen(true)
  }

  const openEditDialog = (row) => {
    if (!row?.surge) return
    setIsEditMode(true)
    setSelectedSurgeId(row.surge._id)
    setFormData({
      zoneId: String(row.zone?._id || row.surge.zoneId || ""),
      surgeType: row.surge.surgeType || "flat",
      surgeValue: String(row.surge.surgeValue ?? ""),
      isEnabled: row.surge.isEnabled !== false,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const zoneId = String(formData.zoneId || "").trim()
    const surgeType = formData.surgeType === "percentage" ? "percentage" : "flat"
    const surgeValue = Number(formData.surgeValue)

    if (!zoneId) {
      toast.error("Please select a zone")
      return
    }
    if (!Number.isFinite(surgeValue) || surgeValue < 0) {
      toast.error("Please enter a valid surge value")
      return
    }
    if (surgeType === "percentage" && surgeValue > 100) {
      toast.error("Percentage surge cannot exceed 100")
      return
    }

    const payload = {
      zoneId,
      surgeType,
      surgeValue,
      isEnabled: formData.isEnabled !== false,
    }

    try {
      setSaving(true)
      const response = isEditMode
        ? await adminAPI.updateZoneDeliverySurge(selectedSurgeId, payload)
        : await adminAPI.createZoneDeliverySurge(payload)

      if (response.data?.success) {
        toast.success(isEditMode ? "Surge updated successfully" : "Surge created successfully")
        resetDialog()
        await fetchSurges()
      } else {
        toast.error(response.data?.message || "Failed to save surge")
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save surge")
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (row) => {
    if (!row?.surge?._id || togglingId) return
    const nextEnabled = row.surge.isEnabled === false
    try {
      setTogglingId(row.surge._id)
      const response = await adminAPI.toggleZoneDeliverySurgeStatus(row.surge._id, nextEnabled)
      if (response.data?.success) {
        toast.success(nextEnabled ? "Surge activated" : "Surge deactivated")
        await fetchSurges()
      } else {
        toast.error(response.data?.message || "Failed to update status")
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status")
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (row) => {
    if (!row?.surge?._id) return
    if (!window.confirm(`Delete surge for ${row.zone?.name || "this zone"}?`)) return

    try {
      const response = await adminAPI.deleteZoneDeliverySurge(row.surge._id)
      if (response.data?.success) {
        toast.success("Surge deleted successfully")
        await fetchSurges()
      } else {
        toast.error(response.data?.message || "Failed to delete surge")
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete surge")
    }
  }

  const zoneOptions = isEditMode
    ? items.map((row) => row.zone).filter(Boolean)
    : availableZones

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Zone Delivery Surge</h1>
              <p className="text-sm text-slate-600">
                Configure extra delivery surge per zone for users and delivery partners
              </p>
            </div>
          </div>
          <Button
            onClick={openCreateDialog}
            disabled={availableZones.length === 0}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Zone Surge
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search zones..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-600">Loading zone surges...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">No zones found</p>
            <p className="text-sm text-slate-500 mt-1">Create zones first, then add surge rules here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Zone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Surge</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => {
                  const zone = row.zone || {}
                  const surge = row.surge
                  return (
                    <tr key={zone._id} className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{zone.name || "Unnamed Zone"}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{zone.serviceLocation || zone.country || "—"}</td>
                      <td className="px-4 py-3 text-sm">
                        {surge ? (
                          <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                            {formatDeliverySurgeLabel(surge.surgeType, surge.surgeValue)}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not configured</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {!surge ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <StatusSwitch
                              enabled={surge.isEnabled !== false}
                              onToggle={() => handleToggle(row)}
                              disabled={togglingId === surge._id}
                              size="sm"
                            />
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                surge.isEnabled !== false
                                  ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                                  : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                              }`}
                            >
                              {surge.isEnabled !== false ? "Active" : "Inactive"}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {surge ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditDialog(row)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(row)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditMode(false)
                                setSelectedSurgeId(null)
                                setFormData({
                                  ...emptyForm,
                                  zoneId: String(zone._id),
                                })
                                setDialogOpen(true)
                              }}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100"
                            >
                              Add Surge
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && resetDialog()}>
        <DialogContent className="max-w-lg bg-gradient-to-br from-slate-50 via-white to-slate-50 p-0 border-0 shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-4 rounded-t-2xl">
            <DialogHeader className="mb-0 pr-8">
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4" />
                {isEditMode ? "Edit Zone Surge" : "Add Zone Surge"}
              </DialogTitle>
            </DialogHeader>
          </div>

          <form
            className="px-5 py-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleSave()
            }}
          >
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Zone <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.zoneId}
                onChange={(e) => setFormData((prev) => ({ ...prev, zoneId: e.target.value }))}
                disabled={isEditMode}
                className={fieldClassName}
                required
              >
                <option value="">Select zone</option>
                {zoneOptions.map((zone) => (
                  <option key={zone._id} value={String(zone._id)}>
                    {zone.name || zone.zoneName}
                  </option>
                ))}
              </select>
              {isEditMode && (
                <p className="text-xs text-slate-500">Zone cannot be changed while editing.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  Surge Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.surgeType}
                  onChange={(e) => setFormData((prev) => ({ ...prev, surgeType: e.target.value }))}
                  className={fieldClassName}
                  required
                >
                  <option value="flat">Flat Amount (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  Surge Value {formData.surgeType === "percentage" ? "(%)" : "(₹)"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {formData.surgeType === "flat" && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-orange-500">
                      ₹
                    </span>
                  )}
                  <input
                    type="number"
                    min="0"
                    step={formData.surgeType === "percentage" ? "0.1" : "1"}
                    value={formData.surgeValue}
                    onChange={(e) => setFormData((prev) => ({ ...prev, surgeValue: e.target.value }))}
                    className={`${fieldClassName} ${formData.surgeType === "flat" ? "pl-8" : ""}`}
                    placeholder={formData.surgeType === "percentage" ? "e.g. 10" : "e.g. 15"}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border-2 border-slate-200 bg-white px-4 py-3">
              <div>
                <span className="block text-sm font-semibold text-slate-800">Surge Status</span>
                <span className="block text-xs text-slate-500">
                  {formData.isEnabled !== false
                    ? "This surge is active and will apply to orders."
                    : "Inactive surges are saved but won't apply to orders."}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-xs font-semibold ${
                    formData.isEnabled !== false ? "text-green-600" : "text-slate-400"
                  }`}
                >
                  {formData.isEnabled !== false ? "Active" : "Inactive"}
                </span>
                <Switch
                  checked={formData.isEnabled !== false}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, isEnabled: checked }))
                  }
                  className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-slate-200"
                />
              </div>
            </div>

            <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5 text-xs leading-relaxed text-orange-800">
              Example: ₹20 delivery fee + ₹10 flat surge = user pays ₹30 (+ GST), rider earns base pay + ₹10.
            </div>

            <DialogFooter className="pt-3 border-t border-slate-200 mt-2 sm:justify-end gap-2">
              <button
                type="button"
                onClick={resetDialog}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold rounded-lg border-2 border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-md shadow-orange-500/30 transition-all disabled:opacity-60"
              >
                {saving ? "Saving..." : isEditMode ? "Update Surge" : "Create Surge"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
