declare module "rison" {
  export function encode(value: unknown): string;
  export function encode_object(value: Record<string, unknown>): string;
  export function encode_array(value: unknown[]): string;
  export function encode_uri(value: unknown): string;
  export function decode<T = unknown>(str: string): T;
  export function decode_object<T = Record<string, unknown>>(str: string): T;
}
