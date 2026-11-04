/** Namespaced localStorage access that never throws (private browsing can disable it). */
export const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem('trapanotto.' + key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('trapanotto.' + key, JSON.stringify(value));
    } catch {
      /* Private browsing can disable persistence. */
    }
  },
};
