import { getChartMetadataRegistry, type BaseFormData } from '@superset-ui/core';

export const getQuerySettings = (formData: BaseFormData) => {
  const vizMetadata = getChartMetadataRegistry().get(formData.viz_type);
  return [
    vizMetadata?.useLegacyApi ?? false,
    vizMetadata?.parseMethod ?? 'json-bigint',
  ];
};