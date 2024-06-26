/* Copyright 2024 Marimo. All rights reserved. */
import { VegaLite, type SignalListeners, type View } from "react-vega";
import { makeSelectable } from "./make-selectable";
import { useMemo, useRef, useState } from "react";
import { getSelectionParamNames } from "./params";
import { VegaLiteSpec } from "./types";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { useDeepCompareMemoize } from "@/hooks/useDeepCompareMemoize";
import { useDebugMounting, usePropsDidChange } from "@/hooks/debug";
import { debounce } from "lodash-es";
import useEvent from "react-use-event-hook";
import { Logger } from "@/utils/Logger";
import { useAsyncData } from "@/hooks/useAsyncData";
import { fixRelativeUrl } from "./fix-relative-url";
import { useTheme } from "@/theme/useTheme";
import { Objects } from "@/utils/objects";
import { resolveVegaSpecData } from "./resolve-data";
import { Events } from "@/utils/events";

export interface Data {
  spec: VegaLiteSpec;
  chartSelection: boolean | "point" | "interval";
  fieldSelection: boolean | string[];
}

export interface VegaComponentState {
  [channel: string]: {
    // List of selected items
    vlPoint?: { or: unknown[] };
    // Either a range or a list of values
    [field: string]:
      | [number, number]
      | string[]
      | number[]
      | { or: unknown[] }
      | undefined;
  };
}

interface VegaComponentProps<T> extends Data {
  value: T;
  setValue: (value: T) => void;
}

const VegaComponent = ({
  value,
  setValue,
  chartSelection,
  fieldSelection,
  spec,
}: VegaComponentProps<VegaComponentState>) => {
  const { data: resolvedSpec } = useAsyncData(async () => {
    // We try to resolve the data before passing it to Vega
    // otherwise it will try to load it internally and flicker
    // Instead we can handle the loading state ourselves,
    // and show the previous chart until the new one is ready
    return resolveVegaSpecData(spec);
  }, [spec]);

  if (!resolvedSpec) {
    return null;
  }

  return (
    <LoadedVegaComponent
      value={value}
      setValue={setValue}
      chartSelection={chartSelection}
      fieldSelection={fieldSelection}
      spec={resolvedSpec}
    />
  );
};

const LoadedVegaComponent = ({
  value,
  setValue,
  chartSelection,
  fieldSelection,
  spec,
}: VegaComponentProps<VegaComponentState>): JSX.Element => {
  const { theme } = useTheme();
  const vegaView = useRef<View>();
  const [error, setError] = useState<Error>();

  // Debug
  useDebugMounting("VegaComponent");
  usePropsDidChange("VegaComponent", {
    value,
    setValue,
    chartSelection,
    fieldSelection,
    spec,
  });

  // Aggressively memoize the spec, so Vega doesn't re-render/re-mount the component
  const selectableSpec = useMemo(() => {
    return makeSelectable(fixRelativeUrl(spec), {
      chartSelection,
      fieldSelection,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useDeepCompareMemoize(spec), chartSelection, fieldSelection]);
  const names = useMemo(
    () => getSelectionParamNames(selectableSpec),
    [selectableSpec],
  );

  // Update the value when the selection changes
  // Keep the old value from other signals
  const handleUpdateValue = useEvent((newValue: VegaComponentState) => {
    setValue({ ...value, ...newValue });
  });

  const signalListeners = useMemo(
    () =>
      names.reduce<SignalListeners>((acc, name) => {
        // Debounce each signal listener, otherwise we may create expensive requests
        acc[name] = debounce((signalName, signalValue) => {
          Logger.debug("[Vega signal]", signalName, signalValue);

          handleUpdateValue({
            [signalName]: Objects.mapValues(
              signalValue as object,
              convertSetToList,
            ),
          });
        }, 100);
        return acc;
      }, {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useDeepCompareMemoize(names), setValue],
  );

  const handleError = useEvent((error) => {
    Logger.error(error);
    Logger.debug(selectableSpec);
    setError(error);
  });

  const handleNewView = useEvent((view) => {
    Logger.debug("[Vega view] created", view);
    vegaView.current = view;
    setError(undefined);
  });

  return (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>{error.message}</AlertTitle>
          <div className="text-md">{error.stack}</div>
        </Alert>
      )}
      <div
        className="contents"
        // Capture the pointer down event to prevent the parent from handling it
        onPointerDown={Events.stopPropagation()}
      >
        <VegaLite
          spec={selectableSpec}
          theme={theme === "dark" ? "dark" : undefined}
          actions={actions}
          signalListeners={signalListeners}
          onError={handleError}
          onNewView={handleNewView}
        />
      </div>
    </>
  );
};

const actions = {
  source: false,
  compiled: false,
};

/**
 * Convert any sets to a list before passing to the BE
 */
function convertSetToList(value: unknown): unknown {
  if (value instanceof Set) {
    return [...value];
  }
  return value;
}

export default VegaComponent;
