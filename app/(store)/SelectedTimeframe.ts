import { create } from "zustand";

type TimeframeStore = {
  timeframe: string;
  setTimeframe: (tf: string) => void;
};

export const useSelectedTimeframe = create<TimeframeStore>((set) => ({
  timeframe: "1 minute",
  setTimeframe: (tf: string) => {
    try {
      if (typeof window !== "undefined")
        window.localStorage.setItem("timeframe", tf);
    } catch {
      // ignore storage errors
    }
    set(() => ({ timeframe: tf }));
  },
}));

export default useSelectedTimeframe;
// Important: do NOT read localStorage synchronously here. Reading during
// store initialization can run on the server and cause hydration mismatch
// if the client has a different stored value. Instead, default to a
// server-safe value and sync from a client-only effect in a component.
