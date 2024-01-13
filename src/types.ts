import type { ComputedRef } from 'vue-demi';

export type UnknownObject = Record<string, any>;

export type Fns = Record<string, Array<Function>>;

export type Data = UnknownObject;

export interface Option<DT extends Data, VT = any> {
  autoTouch?: boolean;
  autoTest?: boolean;
  lazy?: boolean;
  firstError?: boolean;
  touchOnTest?: boolean;
  transform?:
    | ((
        value: VT,
        data?: DT,
        rules?: Rules<DT>,
        option?: Option<DT, VT>,
      ) => Result<DT> | any)
    | ((
        value: VT,
        data?: DT,
        rules?: Rules<DT>,
        option?: Option<DT, VT>,
      ) => Promise<Result<DT> | any>);
}

export interface Rule<DT extends Data, VT = any> {
  test:
    | ((
        value: VT,
        data?: DT,
        rules?: Rules<DT>,
        option?: Option<DT, VT>,
      ) => boolean)
    | ((
        value: VT,
        data?: DT,
        rules?: Rules<DT>,
        option?: Option<DT, VT>,
      ) => Promise<boolean>);
  message?: string | ((value: VT) => string);
  name: string;
}

export type Rules<DT extends Data> = {
  [K in keyof DT]: Array<Rule<DT>> | Rule<DT> | Rules<DT>;
};

export type Dirt<DT extends Data> = {
  [K in keyof DT]: boolean | Dirt<DT>;
};

export type FnsMapItem = Record<string, Array<Function>>;

export type FnsMap = Array<FnsMapItem>;

export interface Error {
  name: string;
  message?: string | null;
}

export interface Entry {
  $invalid: boolean;
  $errors: Array<Error>;
  $messages: Array<string>;
  $pending: boolean;
  $test: (() => void) | (() => Promise<void>);
  $reset: () => void;
  $touch: () => void;
  $uw?: () => void;
}

export type Entries<DT> = {
  [K in keyof DT]: Entry | Entries<DT>;
};

export type GetDataFn<DT> = () => DT;

export type Args<DT extends Data> = [
  GetDataFn<DT>,
  Rules<DT>,
  Dirt<DT>,
  UnknownObject,
  Entries<DT>,
];

export interface ArgsObject<DT extends Data> {
  data: GetDataFn<DT>;
  rules: Rules<DT>;
  dirt: Dirt<DT>;
  rawData: UnknownObject;
  entries: Entries<DT>;
}

export interface ValidationResult {
  $invalid: boolean;
  $errors: Array<Error>;
  $messages: Array<string>;
  $dirty: boolean;
  $pending: boolean;
}

export interface ResultFunctions {
  $test(): void | Promise<void>;
  $reset(): void;
  $touch(): void;
}

export type Result<DT extends Data> = ValidationResult &
  ResultFunctions &
  Partial<{
    [K in keyof DT]: Result<DT>;
  }>;

export interface UseValidate<T extends Data> {
  result: ComputedRef<Result<T>>;
}
