// A failed network/server-action request must not strand a form in "saving"
// or turn a failed load into an empty-success screen.
export const safeAction = (action) => async (...args) => {
  try { return await action(...args); }
  catch { return { success: false, error: 'Could not complete the request. Refresh the page and try again.' }; }
};
