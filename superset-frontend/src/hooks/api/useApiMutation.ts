/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import rison from 'rison';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SupersetClient, getClientErrorObject } from '@superset-ui/core';
import { t } from '@apache-superset/core/translation';
import { queryKeys } from './queryKeys';

interface MutationOptions {
  resource: string;
  onError?: (msg: string) => void;
  onSuccess?: () => void;
}

export function useDeleteResource(options: MutationOptions) {
  const { resource, onError, onSuccess } = options;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await SupersetClient.delete({
        endpoint: `/api/v1/${resource}/${id}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.resource.all(resource),
      });
      onSuccess?.();
    },
    onError: async (response: any) => {
      const errorObj = await getClientErrorObject(response);
      const msg =
        errorObj?.message ||
        errorObj?.error ||
        t('An error occurred while deleting');
      onError?.(msg);
    },
  });
}

export function useBulkDeleteResource(options: MutationOptions) {
  const { resource, onError, onSuccess } = options;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: number[]) => {
      await SupersetClient.delete({
        endpoint: `/api/v1/${resource}/?q=${rison.encode(ids)}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.resource.all(resource),
      });
      onSuccess?.();
    },
    onError: async (response: any) => {
      const errorObj = await getClientErrorObject(response);
      const msg =
        errorObj?.message ||
        errorObj?.error ||
        t('An error occurred while deleting');
      onError?.(msg);
    },
  });
}

interface CreateOptions<D> {
  resource: string;
  onError?: (msg: string) => void;
  onSuccess?: (id: number) => void;
}

export function useCreateResource<D extends object = any>(
  options: CreateOptions<D>,
) {
  const { resource, onError, onSuccess } = options;
  const queryClient = useQueryClient();

  return useMutation<number, any, D>({
    mutationFn: async (body: D) => {
      const { json } = await SupersetClient.post({
        endpoint: `/api/v1/${resource}/`,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
      return json.id as number;
    },
    onSuccess: (id: number) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.resource.all(resource),
      });
      onSuccess?.(id);
    },
    onError: async (response: any) => {
      const errorObj = await getClientErrorObject(response);
      const msg =
        errorObj?.message ||
        errorObj?.error ||
        t('An error occurred while creating');
      onError?.(msg);
    },
  });
}

interface UpdateOptions<D> {
  resource: string;
  onError?: (msg: string) => void;
  onSuccess?: (result: D) => void;
}

export function useUpdateResource<D extends object = any>(
  options: UpdateOptions<D>,
) {
  const { resource, onError, onSuccess } = options;
  const queryClient = useQueryClient();

  return useMutation<D, any, { id: number; body: Partial<D> }>({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number;
      body: Partial<D>;
    }) => {
      const { json } = await SupersetClient.put({
        endpoint: `/api/v1/${resource}/${id}`,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
      return json.result as D;
    },
    onSuccess: (result: D) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.resource.all(resource),
      });
      onSuccess?.(result);
    },
    onError: async (response: any) => {
      const errorObj = await getClientErrorObject(response);
      const msg =
        errorObj?.message ||
        errorObj?.error ||
        t('An error occurred while updating');
      onError?.(msg);
    },
  });
}
