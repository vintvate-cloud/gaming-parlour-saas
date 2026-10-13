import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../utils/api";

const BrandingContext = createContext(null);

const DEFAULTS = {
  businessName: "Gaming Parlour",
  appTagline: "Station Management System",
  logoUrl: "",
};

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/settings");
      setBranding({
        businessName: res.data.businessName || DEFAULTS.businessName,
        appTagline: res.data.appTagline || DEFAULTS.appTagline,
        logoUrl: res.data.logoUrl || "",
      });
    } catch {
      // If settings can't be fetched yet (e.g. not logged in), keep defaults.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <BrandingContext.Provider value={{ ...branding, loaded, refresh }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
