/** Compile-time tests of the types produced by the code generator for the example schema. */
import { expectTypeOf } from "vitest";
import { HttpError, createNexClient, type EndpointError } from "@syncapi/core";
import {
  createApi,
  type ApiError,
  type DeleteUserErrorBody,
  type ListUsersData,
  type LoginBody,
  type LoginErrorBody,
  type Session,
  type UpdateUserErrorBody,
  type User,
} from "../examples/basic/generated/index.js";

const api = createApi(createNexClient({ baseUrl: "https://api.test" }));

expectTypeOf(api.users.byId("42").get()).toEqualTypeOf<Promise<User>>();
expectTypeOf(api.auth.login.post({ email: "a", password: "b" })).toEqualTypeOf<Promise<Session>>();
expectTypeOf(api.users.list.get({ query: { page: 1, limit: 20, role: ["admin"] } })).toEqualTypeOf<
  Promise<ListUsersData>
>();
expectTypeOf(api.users.byId("1").delete()).toEqualTypeOf<Promise<void>>();

// @ts-expect-error path parameter is required to navigate
api.users.byId();
// @ts-expect-error password is required
api.auth.login.post({ email: "a" } satisfies Partial<LoginBody>);
// @ts-expect-error role must be one of the enum members
api.users.list.get({ query: { role: ["superuser"] } });
// @ts-expect-error unknown field in the patch body
api.users.byId("1").patch({ nickname: "x" });
// @ts-expect-error queries have no body-first signature
api.users.byId("1").get({ name: "x" });
// @ts-expect-error resources that do not exist in the schema are compile errors
void api.orders;

// endpoint options carry the response type, the select type, and the typed key
const opts = api.users.byId("1").get.options(undefined, { select: (u) => u.role });
expectTypeOf(opts.select).parameter(0).toEqualTypeOf<User>();
expectTypeOf(api.users.byId("1").get.key()).toMatchTypeOf<readonly unknown[]>();

// status-discriminated errors: `instanceof` + `status` narrow the typed `body`
declare const updateFailure: EndpointError<UpdateUserErrorBody>;
if (updateFailure instanceof HttpError) {
  expectTypeOf(updateFailure.status).toEqualTypeOf<422>();
  expectTypeOf(updateFailure.body).toEqualTypeOf<ApiError>();
}
declare const loginFailure: EndpointError<LoginErrorBody>;
if (loginFailure instanceof HttpError) expectTypeOf(loginFailure.status).toEqualTypeOf<401>();
// a request-less 204 endpoint documents no errors: any HttpError, body unknown
declare const deleteFailure: EndpointError<DeleteUserErrorBody>;
if (deleteFailure instanceof HttpError) expectTypeOf(deleteFailure.body).toBeUnknown();

// non-JSON payloads: binary → Blob, text → string, multipart body takes a Blob for `file`
expectTypeOf(api.users.byId("1").avatar.get()).toEqualTypeOf<Promise<Blob>>();
expectTypeOf(api.exports.users.get()).toEqualTypeOf<Promise<string>>();
expectTypeOf(api.users.byId("1").avatar.post).parameter(0).toHaveProperty("file");
expectTypeOf(api.users.byId("1").avatar.post).parameter(0).not.toBeAny();
// @ts-expect-error `file` is required and must be a Blob
void api.users.byId("1").avatar.post({ file: "not a blob" });
