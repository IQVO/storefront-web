import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { saveDestination, type Destination } from "~/lib/destination.ts";
import { currentShopper, hasShopperSession } from "~/lib/shopper.ts";
import type { SavedAddress, Shopper } from "~/lib/types.ts";

export interface SessionValue {
  /** Where the shopper wants things delivered: the ZIP they entered, else their first saved address. */
  destination: Destination | null;
  /** The city of the first saved address when it is the destination (header chip). */
  city: string | null;
  /** The signed-in shopper once known in the browser; null when anonymous. */
  shopper: Shopper | null;
  setZip: (zip: string) => Destination | null;
  setShopper: (s: Shopper | null) => void;
}

const fallback: SessionValue = {
  destination: null,
  city: null,
  shopper: null,
  setZip: (zip) => saveDestination(zip),
  setShopper: () => undefined,
};

const SessionContext = createContext<SessionValue>(fallback);

export const useSession = (): SessionValue => useContext(SessionContext);

const firstAddress = (s: Shopper | null): SavedAddress | undefined => s?.savedAddresses[0];

/**
 * Shopper-side state for the whole layout. The destination starts from the sf_dest cookie read during
 * SSR; the shopper is looked up after hydration and only when the browser holds a session marker.
 */
export function SessionProvider({ initialDestination, children }: { initialDestination: Destination | null; children: React.ReactNode }) {
  const [destination, setDestination] = useState<Destination | null>(initialDestination);
  const [shopper, setShopperState] = useState<Shopper | null>(null);

  const setZip = useCallback((zip: string) => {
    const d = saveDestination(zip);
    if (d) setDestination(d);
    return d;
  }, []);

  const setShopper = useCallback(
    (s: Shopper | null) => {
      setShopperState(s);
      const addr = firstAddress(s);
      // A signed-in shopper without an entered ZIP gets their first saved address as the destination.
      if (addr && !destination) setZip(addr.postalCode);
    },
    [destination, setZip],
  );

  useEffect(() => {
    if (!hasShopperSession()) return;
    let live = true;
    currentShopper()
      .then((s) => live && setShopper(s))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Looked up once per document; sign-in and registration call setShopper themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SessionValue>(() => {
    const addr = firstAddress(shopper);
    const city = addr && destination && addr.postalCode.replace(/\s/g, "").toUpperCase().startsWith(destination.zip.replace(/\s/g, "")) ? addr.city : null;
    return { destination, city, shopper, setZip, setShopper };
  }, [destination, shopper, setZip, setShopper]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
