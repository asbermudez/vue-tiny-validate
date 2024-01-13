import type { ComputedRef, Ref, UnwrapRef } from 'vue-demi';
import { computed, reactive, watch } from 'vue-demi';
import {
  ENTRY_PARAM,
  NOOP,
  OPTION,
  hasOwn,
  isObject,
  setReactiveValue,
  unwrap,
} from './helpers';
import type {
  ArgsObject,
  Data,
  Dirt,
  Entries,
  Entry,
  Error,
  GetDataFn,
  Option,
  Result,
  ResultFunctions,
  Rule,
  Rules,
  UnknownObject,
  UseValidate,
  ValidationResult,
} from './types';

const useValidate = <DT extends Data>(
  _data: UnwrapRef<DT> | Ref<DT> | ComputedRef<DT>,
  _rules: UnwrapRef<Rules<DT>> | Ref<Rules<DT>> | ComputedRef<Rules<DT>>,
  _option:
    | UnwrapRef<Option<DT>>
    | Ref<Option<DT>>
    | ComputedRef<Option<DT>> = reactive({}),
): UseValidate<DT> => {
  const dirt = reactive({} as Dirt<DT>);
  const rawData = reactive<UnknownObject>({});
  const entries = reactive({} as Entries<DT>);

  const option = computed<Option<DT>>(() => ({
    ...OPTION,
    ...unwrap(_option),
  }));

  const result = computed<Result<DT> | any>(() => {
    const rawResult: Result<DT> = getResult(unwrap(entries), unwrap(dirt));
    const { transform } = option.value;

    return transform
      ? transform(rawResult, unwrap(_data), unwrap(_rules), unwrap(_option))
      : rawResult;
  });

  const getResult = (
    entries: Entries<DT> | Entry,
    dirt: Dirt<DT>,
  ): Result<DT> => {
    let result = {
      ...ENTRY_PARAM,
      $dirty: false,
      $test: NOOP,
      $reset: NOOP,
      $touch: NOOP,
    } as Result<DT>;
    const keys: Array<keyof Entries<DT>> = Object.keys(entries);

    const fns: Record<keyof ResultFunctions, Function[]> = {
      $test: [],
      $reset: [],
      $touch: [],
    };
    const fnsKeys = Object.keys(fns) as Array<keyof ResultFunctions>;

    const setOverallResult = <DT extends Data>(
      result: Result<DT>,
      childResult: Result<DT>,
    ): void => {
      const fields: Array<keyof ValidationResult> = [
        '$dirty',
        ...(Object.keys(ENTRY_PARAM) as Array<keyof ValidationResult>),
      ];

      for (const field of fields) {
        switch (field) {
          case '$errors':
            result[field] = [...result[field], ...childResult[field]];
            break;
          case '$messages':
            result[field] = [...(result[field] || []), ...childResult[field]];
            break;
          default:
            console.log('🥒', field, result[field], childResult[field]);
            result[field] = !result[field] && childResult[field];
            break;
        }
      }

      for (const key of fnsKeys) {
        fns[key].push(childResult[key]);
      }
    };

    for (const key of keys) {
      if (!('$invalid' in entries)) {
        const childResult = getResult(entries[key], dirt[key] as Dirt<DT>);

        result = { ...result, [key]: { ...childResult } };
        setOverallResult(result, childResult);
      } else {
        const finalResult = {
          ...(entries as Entry),
          $dirty: dirt[key] as boolean,
        } as Result<DT>;
        result = { ...result, [key]: finalResult[key] };
        setOverallResult(result, finalResult);
      }
    }

    for (const key of fnsKeys) {
      result[key] = async () => {
        const executedFns = fns[key].map((fn: Function) => fn());
        if (key === '$test') {
          await Promise.all(executedFns);
        }
      };
    }

    return result;
  };

  const setDefaultValue = (
    data: GetDataFn<DT>,
    rules: Rules<DT>,
    dirt: Dirt<DT>,
    rawData: UnknownObject,
    entries: Entries<DT>,
  ): void => {
    const keys: Array<string> = Object.keys(rules);

    for (const key of keys) {
      if (
        isObject(rules[key]) &&
        !hasOwn(rules[key], 'test') &&
        !hasOwn(rules[key], 'name')
      ) {
        setReactiveValue(rawData, key, {});
        setReactiveValue(dirt, key, reactive({}));
        setReactiveValue(entries, key, reactive({}));

        setDefaultValue(
          () => data()[key],
          rules[key] as Rules<DT>,
          dirt[key] as Dirt<DT>,
          rawData[key],
          entries[key] as Entries<DT>,
        );
      } else {
        setReactiveValue(dirt, key, false);
        setReactiveValue(rawData, key, data()[key]);

        const entryData: ArgsObject<DT> = {
          data,
          rules,
          dirt,
          rawData,
          entries,
        };

        setReactiveValue(entries, key, {
          ...ENTRY_PARAM,
          $reset: () => reset(entryData, key),
          $test: async () => await test(entryData, key),
          $touch: () => touch(entryData, key),
        });

        Object.setPrototypeOf(entries[key], {
          $uw: watch(
            () => data()[key],
            () => {
              if (option.value.autoTest) (entries[key] as Entry).$test();
              if (option.value.autoTouch) (entries[key] as Entry).$touch();
            },
          ),
        });
      }
    }
  };

  const test = async (
    entryData: ArgsObject<DT>,
    key: string,
  ): Promise<void> => {
    const { data, rules, dirt, rawData, entries } = entryData;
    const { lazy, firstError, touchOnTest } = option.value;

    const isDirtied = dirt[key] || touchOnTest || data()[key] !== rawData[key];

    if (lazy && !isDirtied) return;

    let cancel = false;

    const unWatchPending = watch(
      () => entries[key].$pending,
      (value: unknown) => {
        if (!value) cancel = true;
      },
    );

    const $errors: Array<Error> = [];
    const $messages: Array<string> = [];
    let ruleItem = rules[key] as Rule<DT> | Array<Rule<DT>>;

    if (!ruleItem) return;

    if (!Array.isArray(ruleItem)) ruleItem = [ruleItem];

    for (const rule of ruleItem) {
      const { test, message = null, name } = rule;
      let testValue: boolean | Promise<boolean> = test(
        data()[key],
        unwrap(_data),
        unwrap(_rules),
        unwrap(_option),
      );

      if (testValue instanceof Promise) {
        entries[key].$pending = true;

        try {
          testValue = await testValue;
        } catch (e) {
          testValue = false;
        }

        if (!cancel) entries[key].$pending = false;
      }

      if (!testValue) {
        const testMessage =
          typeof message === 'function'
            ? message(data()[key])
            : (message as string);

        $errors.push({ name, message: testMessage });

        if (testMessage) $messages.push(testMessage);

        if (firstError) break;
      }
    }

    unWatchPending();

    if (!cancel) {
      setReactiveValue(dirt, key, isDirtied);
      setReactiveValue(entries, key, {
        ...entries[key],
        $errors,
        $messages,
        $invalid: Boolean($errors.length),
      } as Entry);
    }
  };

  const reset = (entryData: ArgsObject<DT>, key: string): void => {
    const { dirt, entries } = entryData;

    setReactiveValue(dirt, key, false);
    setReactiveValue(entries, key, {
      ...entries[key],
      ...ENTRY_PARAM,
    } as Entry);
  };

  const touch = (entryData: ArgsObject<DT>, key: string): void => {
    const { dirt } = entryData;

    setReactiveValue(dirt, key, true);
  };

  const initialize = (): void => {
    setDefaultValue(
      () => unwrap(_data),
      unwrap(_rules),
      unwrap(dirt),
      rawData,
      unwrap(entries),
    );
  };

  initialize();

  watch(() => unwrap(_rules), initialize);

  watch(_option, initialize);

  // FOR DEVELOPMENT PURPOSE

  /* c8 ignore start */
  if (import.meta.env.MODE === 'development') {
    const watchOption = { immediate: true, deep: true };

    const watchCallback =
      (label: string) =>
      (value: any): void => {
        console.log('\x1B[32m%s\x1B[0m', label, value);
      };

    watch(result, watchCallback('RESULT'));

    watch(_data, watchCallback('DATA UPDATED'), watchOption);

    watch(_rules, watchCallback('RULES UPDATED'), watchOption);

    watch(_option, watchCallback('OPTIONS UPDATED'), watchOption);
  }
  /* c8 ignore stop */

  return { result };
};

export default useValidate;

export * from './types';
