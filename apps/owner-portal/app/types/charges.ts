// Tax & Charges module (handover §1/§4/§5/§6) — Owner Portal types.
// Mirrors services/api/src/routes/charge-categories.ts, charge-assignments.ts,
// and payment-methods.ts exactly. Kept local to the owner-portal app (same
// pattern already used by app/dashboard/categories/page.tsx) rather than
// added to @repo/types, since nothing outside this app needs these shapes.

export type ChargeCategoryType = "tax" | "surcharge" | "other";
export type CalculationType = "fixed" | "percentage";
export type ChargeScope = "per_product" | "whole_bill";
export type ConditionType = "payment_method" | "manual_selection";
export type AssignmentLevel =
  | "branch"
  | "product_category"
  | "product_sub_category"
  | "product";
export type OverrideType = "inherit" | "override_on" | "override_off" | "override_rate";

export interface ChargeRateLine {
  id?: string;
  calculationType: CalculationType;
  // Kept as string end-to-end (matches the numeric column + API's
  // string-or-number transform) so a half-typed "5." never gets coerced
  // to NaN mid-edit.
  value: string;
  scope: ChargeScope;
  conditionType: ConditionType;
  conditionPaymentMethodId?: string | null;
  manualSelectionLabel?: string | null;
  dependsOnChargeCategoryId?: string | null;
}

export interface ChargeCategory {
  id: string;
  versionGroupId: string;
  branchId: string | null;
  name: string;
  nameSecondaryLanguage: string | null;
  categoryType: ChargeCategoryType;
  isRegulatoryReportable: boolean;
  regulatoryAuthorityName: string | null;
  countsTowardOtherBases: boolean;
  refundableOnReturn: boolean;
  isActive: boolean;
  isCurrent: boolean;
  rateLines: ChargeRateLine[];
}

export interface ChargeCategoryPayload {
  branchId?: string | null;
  name: string;
  nameSecondaryLanguage?: string | null;
  categoryType: ChargeCategoryType;
  isRegulatoryReportable?: boolean;
  regulatoryAuthorityName?: string | null;
  countsTowardOtherBases?: boolean;
  refundableOnReturn?: boolean;
  rateLines: ChargeRateLine[];
}

export interface ChargeAssignment {
  id: string;
  chargeCategoryId: string;
  assignmentLevel: AssignmentLevel;
  targetId: string;
  overrideType: OverrideType;
  // Only set (both together) when overrideType = "override_rate" — this
  // target gets its own tax/charge value instead of the category's normal
  // rate line(s), e.g. Tax stays at 15% everywhere except "Leg Piece".
  rateOverrideCalculationType?: CalculationType | null;
  rateOverrideValue?: string | null;
}

export interface PaymentMethod {
  id: string;
  name: string;
  requiresRounding: boolean;
  roundingMethod: "exact" | "round_up" | "round_down";
  isActive: boolean;
}

export interface ProductSubCategoryLite {
  id: string;
  name: string;
  token: string;
}

export interface ProductCategoryLite {
  id: string;
  name: string;
  token: string;
  subCategories: ProductSubCategoryLite[];
}
