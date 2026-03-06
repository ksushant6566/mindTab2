import type createClient from "openapi-fetch";
import type { paths } from "@mindtab/api-spec";

export type ApiClient = ReturnType<typeof createClient<paths>>;
