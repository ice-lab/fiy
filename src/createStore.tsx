import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import isPromise from 'is-promise';
import transform from 'lodash.transform';
import { createContainer } from './createContainer';
import { ContextHookReturn } from './types';

const isDev = process.env.NODE_ENV !== 'production';

export type PropType<TObj, TProp extends keyof TObj> = TObj[TProp];

export type ReactSetState<S> = React.Dispatch<React.SetStateAction<S>>;

export type ModelConfigAction<S = any> = (prevState: S, payload?: any, actions?: any, globalActions?: any) => S | Promise<S>;

export interface ModelConfigActions<S = any> {
  [name: string]: ModelConfigAction<S>;
}

export interface ModelConfig<S = any> {
  state: S;
  actions?: ModelConfigActions<S>;
};

export interface ModelConfigs {
  [namespace: string]: ModelConfig;
}

export interface ModelProps<S = any> {
  initialState?: S;
}

export interface FunctionState {
  isLoading: boolean;
  error: Error;
}

export type FunctionsState<Functions> = {
  [K in keyof Functions]: FunctionState;
}

export type SetFunctionsState<Functions> = ReactSetState<FunctionsState<Functions>>;

export type ActionIdentifier = number;

export type ActionsIdentifier<ConfigActions> = {
  [K in keyof ConfigActions]: ActionIdentifier;
}

export interface ActionPayload {
  payload: any;
  identifier: ActionIdentifier;
}

export type ActionsPayload<ConfigActions> = {
  [K in keyof ConfigActions]: ActionPayload;
}

export type SetActionsPayload<ConfigActions> = ReactSetState<ActionsPayload<ConfigActions>>;

export type Actions<ConfigActions extends ModelConfigActions> = {
  [K in keyof ConfigActions]: (payload?: Parameters<ConfigActions[K]>[1]) => void;
}

export type TModelConfigState<M extends ModelConfig> = PropType<M, 'state'>;
export type TModelConfigActions<M extends ModelConfig> = PropType<M, 'actions'>;
export type TModelActions<M extends ModelConfig> = Actions<TModelConfigActions<M>>;
export type TModelActionsState<M extends ModelConfig> = FunctionsState<TModelConfigActions<M>>;
export type TUseModelValue<M extends ModelConfig> = [ TModelConfigState<M>, TModelActions<M>, TModelActionsState<M> ];
export type TModel<M extends ModelConfig> =
  ContextHookReturn<TModelConfigState<M>, TUseModelValue<M>, [(model: TUseModelValue<M>) => TModelConfigState<M>, (model: TUseModelValue<M>) => TModelActions<M>, (model: TUseModelValue<M>) => TModelActionsState<M>]>;

export function createModel<M extends ModelConfig, K = string>(config: M, namespace?: K, modelsActions?): TModel<M> {
  type ModelState = TModelConfigState<M>;
  type ModelConfigActions = TModelConfigActions<M>;
  type ModelConfigActionsKey = keyof ModelConfigActions;
  type ModelActions = TModelActions<M>;
  type ModelActionsState = TModelActionsState<M>;
  type SetModelFunctionsState = SetFunctionsState<ModelConfigActions>;
  type UseModelValue = TUseModelValue<M>;

  const { state: defineState = {}, actions: defineActions = [] } = config;
  let actions;

  function useFunctionsState(functions: ModelConfigActionsKey[]):
  [ ModelActionsState, SetModelFunctionsState, (name: ModelConfigActionsKey, args: FunctionState) => void ] {
    const functionsInitialState = useMemo<ModelActionsState>(
      () => transform(functions, (result, name) => {
        result[name] = {
          isLoading: false,
          error: null,
        };
      }, {}),
      [functions],
    );
    const [ functionsState, setFunctionsState ] = useState<ModelActionsState>(() => functionsInitialState);
    const setFunctionState = useCallback(
      (name: ModelConfigActionsKey, args: FunctionState) => setFunctionsState(prevState => ({
        ...prevState,
        [name]: {
          ...prevState[name],
          ...args,
        },
      })),
      [],
    );
    return [ functionsState, setFunctionsState, setFunctionState ];
  }

  function useActions(state: ModelState, setState: ReactSetState<ModelState>):
  [ ActionsPayload<ModelActions>, (name: ModelConfigActionsKey, payload: any) => void, ModelActionsState ] {
    const [ actionsState, , setActionsState ] = useFunctionsState(Object.keys(defineActions));
    const [ actionsInitialPayload, actionsInitialIdentifier ]: [ActionsPayload<ModelActions>, ActionsIdentifier<ModelActions>] = useMemo(
      () => transform(defineActions, (result, action, name) => {
        const state = {
          payload: null,
          identifier: 0,
        };
        result[0][name] = state;
        result[1][name] = state.identifier;
      }, [ {}, {} ]),
      [],
    );
    const [ actionsPayload, setActionsPayload ]: [ ActionsPayload<ModelActions>, SetActionsPayload<ModelActions> ] = useState(() => actionsInitialPayload);
    const setActionPayload = useCallback(
      (name, payload) => setActionsPayload(prevState => ({
        ...prevState,
        [name]: {
          ...prevState[name],
          payload,
          identifier: prevState[name].identifier + 1,
        },
      })),
      [],
    );

    const actionsIdentifier = useRef(actionsInitialIdentifier);
    const actionsPayloadIdentifier = Object.keys(actionsPayload).map((name) => actionsPayload[name].identifier);

    useEffect(() => {
      Object.keys(actionsPayload).forEach((name) => {
        const { identifier, payload } = actionsPayload[name];
        if (identifier && identifier !== actionsIdentifier.current[name]) {
          actionsIdentifier.current = {
            ...actionsIdentifier.current,
            [name]: identifier,
          };
          (async () => {
            const nextState = defineActions[name](state, payload, actions, modelsActions);
            if (isPromise(nextState)) {
              setActionsState(name, {
                isLoading: true,
                error: null,
              });
              try {
                setState(await nextState);
                setActionsState(name, {
                  isLoading: false,
                  error: null,
                });
              } catch (error) {
                setActionsState(name, {
                  isLoading: false,
                  error,
                });
              }
            } else {
              setState(nextState);
            }
          })();
        }
      });
    }, [ actionsPayloadIdentifier ]);

    return [ actionsPayload, setActionPayload, actionsState ];
  }

  function useModel({ initialState }: ModelProps<ModelState>): UseModelValue {
    const preloadedState = initialState || (defineState as ModelState);
    const [ state, setState ] = useState<ModelState>(preloadedState);
    const [ , executeAction, actionsState ] = useActions(state, setState);

    actions = useMemo(() => transform(defineActions, (result, fn, name) => {
      result[name] = (payload) => executeAction(name, payload);
    }), [defineActions]);

    if (namespace && modelsActions) {
      modelsActions[namespace] = actions;
    }
    return [ state, actions, actionsState ];
  }

  if (isDev && namespace) {
    useModel.displayName = namespace;
  }

  return createContainer(
    useModel,
  value => value[0],
  value => value[1],
  value => value[2],
  );
}

export function createStore<C extends ModelConfigs>(configs: C) {
  function getModel<K extends keyof C>(namespace: K): TModel<C[K]> {
    const model = models[namespace];
    if (!model) {
      throw new Error(`Not found model by namespace: ${namespace}.`);
    }
    return model;
  }

  function Provider({ children, initialStates = {} }) {
    Object.keys(models).forEach((namespace) => {
      const [ ModelProvider ] = getModel(namespace);
      children = <ModelProvider initialState={initialStates[namespace]}>
        {children}
      </ModelProvider>;
    });
    return <>{children}</>;
  }

  function useModelState<K extends keyof C>(namespace: K): TModelConfigState<C[K]> {
    const [, useModelState ] = getModel(namespace);
    return useModelState();
  }

  function useModelActions<K extends keyof C>(namespace: K): TModelActions<C[K]> {
    const [, , useModelActions ] = getModel(namespace);
    return useModelActions();
  }

  function useModelActionsState<K extends keyof C>(namespace: K): TModelActionsState<C[K]> {
    const [, , , useModelActionsState ] = getModel(namespace);
    return useModelActionsState();
  }

  function useModel<K extends keyof C>(namespace: K): [TModelConfigState<C[K]>, TModelActions<C[K]>] {
    return [ useModelState(namespace), useModelActions(namespace) ];
  }

  function createWithUse(useFun) {
    const fnName = useFun.name;
    return function withModel(namespace, mapDataToProps?) {
      const propName = fnName === useModel.name ? namespace : `${namespace}${fnName.slice(8)}`;
      return (Component) => {
        return (props): React.ReactElement => {
          const model = useFun(namespace);
          const modelProps = mapDataToProps ? mapDataToProps(model) : { [propName]: model };
          return (
            <Component
              {...modelProps}
              {...props}
            />
          );
        };
      };
    };
  }

  function withModel<K extends keyof C>(namespace: K, mapModelToProps?) {
    return createWithUse(useModel)(namespace, mapModelToProps);
  }

  function withModelActions<K extends keyof C>(namespace: K, mapModelActionsToProps?) {
    return createWithUse(useModelActions)(namespace, mapModelActionsToProps);
  }

  function withModelActionsState<K extends keyof C>(namespace?: K, mapModelActionsStateToProps?) {
    return createWithUse(useModelActionsState)(namespace, mapModelActionsStateToProps);
  }

  const modelsActions = {};
  const models: { [K in keyof C]?: TModel<C[K]> } = {};
  Object.keys(configs).map(namespace => {
    const config = configs[namespace];
    models[namespace as (keyof C)] = createModel(config, namespace, modelsActions);
  });

  return {
    Provider,
    useModel,
    useModelActions,
    useModelActionsState,
    withModel,
    withModelActions,
    withModelActionsState,
  };
}
