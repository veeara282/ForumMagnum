import { useCallback, MouseEvent, useState, useEffect } from "react";

/**
 * We have lots of places that toggle values on the backend and then show
 * the result somehow in the UI. This can be unpleasantly laggy if we just
 * display the new value received from the backend, so this hook can be used
 * to keep track of an "optimistic" client-side value as well.
 */
export const useOptimisticToggle = (
  actualValue: boolean,
  toggle: (e: MouseEvent<HTMLDivElement>) => void,
): [boolean, (e: MouseEvent<HTMLDivElement>) => void] => {
  const [optimisticValue, setOptimisticValue] = useState(actualValue);

  const toggleValue = useCallback((e: MouseEvent<HTMLDivElement>) => {
    setOptimisticValue((value) => !value);
    toggle(e);
  }, [toggle]);

  useEffect(() => {
    setOptimisticValue(actualValue);
  }, [actualValue]);

  return [
    optimisticValue,
    toggleValue,
  ];
}
