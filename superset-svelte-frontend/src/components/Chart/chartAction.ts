import { SupersetClient, getClientErrorObject } from '@superset-ui/core';

export const getChartDataRequest = async (options: any) => {
  const { formData, force = false, requestParams = {} } = options;
  const payload = { ...formData };

  try {
    const response = await SupersetClient.post({
      endpoint: '/api/v1/chart/data',
      jsonPayload: { ...payload, force },
      ...requestParams,
    });
    return {
      json: response.json,
      response,
    };
  } catch (error) {
    const clientError = await getClientErrorObject(error as Response);
    throw clientError;
  }
};

export const handleChartDataResponse = (response: any, json: any, useLegacyApi: boolean) => {
  if (useLegacyApi) {
    return json.result;
  }
  return json.result;
};