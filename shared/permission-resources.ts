export const EDUCATION_CONFIG_HREF = "/education-config";
export const EDUCATION_OTHER_CONFIG_RESOURCE = `${EDUCATION_CONFIG_HREF}#other-config`;

export function getSubFeaturePermissionResource(
  href: string,
  tabValue: string,
  featureValue: string,
): string {
  return `${href}#${tabValue}/${featureValue}`;
}

export const AUTO_INVOICE_FEATURE_PERMISSION_RESOURCE = getSubFeaturePermissionResource(
  EDUCATION_CONFIG_HREF,
  "other-config",
  "auto-invoice",
);

export const PAST_SCHEDULE_FEATURE_PERMISSION_RESOURCE = getSubFeaturePermissionResource(
  EDUCATION_CONFIG_HREF,
  "other-config",
  "past-schedule",
);
