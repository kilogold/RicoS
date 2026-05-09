import { revalidateTag } from "next/cache";
import { MENU_RUNTIME_CACHE_TAG } from "./menu-runtime-tags";

export function revalidateMenuRuntimeCache(): void {
  revalidateTag(MENU_RUNTIME_CACHE_TAG, "max");
}
