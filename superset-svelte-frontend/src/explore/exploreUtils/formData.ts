import { SupersetClient } from '@superset-ui/core';
import type { JsonObject } from '@superset-ui/core';
import { sanitizeFormData } from 'src/utils/sanitizeFormData';

export const postFormData = (
  formData: JsonObject,
  endpoint = '/superset/explore_json/',
) => {
  const sanitizedFormData = sanitizeFormData(formData);
  return SupersetClient.post({
    endpoint,
    postPayload: { form_data: sanitizedFormData },
    stringify: false,
  });
};

export const putFormData = (
  formData: JsonObject,
  endpoint = '/superset/explore_json/',
) => {
  const sanitizedFormData = sanitizeFormData(formData);
  return SupersetClient.put({
    endpoint,
    postPayload: { form_data: sanitizedFormData },
    stringify: false,
  });
};