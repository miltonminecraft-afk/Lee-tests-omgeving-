// Keep the previous/partial frame covered until all resources and the first frame are ready.
export async function loadCompleteRoom({load,prepare,reveal,fail}) {
  try {
    await load();
    await prepare();
    await reveal();
    return true;
  } catch(error) {
    fail(error);
    return false;
  }
}
