// This describes the generator's supported subset, not the API model fields.
// Unknown keys remain visible so runtime validation can reject new keywords.
export interface Schema {
  [keyword: string]: unknown;
  type?: string | string[];
  $ref?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: boolean;
  enum?: string[];
  format?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  pattern?: string;
  'x-sdk-kind'?: 'request' | 'response';
}

export interface Contract {
  openapi: string;
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, Schema> };
}

export interface PythonBinding {
  [option: string]: unknown;
  required?: boolean;
  strict?: boolean;
  defaultFactory?: 'list';
}

export interface Bindings {
  models?: Record<string, {
    [option: string]: unknown;
    generate?: boolean;
    javaImports?: string[];
  }>;
  fields?: Record<string, {
    [language: string]: unknown;
    python?: PythonBinding;
  }>;
}

export const languages = ['js', 'python', 'java'] as const;
export type Language = typeof languages[number];
export type ModelFiles = Record<string, string>;
export type GeneratedModels = Record<Language, ModelFiles>;
