
import {
  OpenAPIRegistry, OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { withRoute, ok } from '@/lib/api/handler';
import {
  signInSchema, forgotPasswordSchema, resetPasswordSchema,
  createUnitSchema, updateUnitSchema,
  inviteUserSchema, updateUserSchema,
  createItemApiSchema, updateProductSchema, updateVariantSchema,
  setUserCapabilitiesSchema, createTemplateSchema, updateTemplateSchema,
  createBarChitSchema,
} from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let cached: ReturnType<OpenApiGeneratorV31['generateDocument']> | null = null;

function build() {
  const r = new OpenAPIRegistry();
  r.register('SignInInput', signInSchema);
  r.register('ForgotPasswordInput', forgotPasswordSchema);
  r.register('ResetPasswordInput', resetPasswordSchema);
  r.register('CreateUnitInput', createUnitSchema);
  r.register('UpdateUnitInput', updateUnitSchema);
  r.register('InviteUserInput', inviteUserSchema);
  r.register('UpdateUserInput', updateUserSchema);
  r.register('CreateItemInput', createItemApiSchema);
  r.register('UpdateProductInput', updateProductSchema);
  r.register('UpdateVariantInput', updateVariantSchema);
  r.register('SetUserCapabilitiesInput', setUserCapabilitiesSchema);
  r.register('CreateCapabilityTemplateInput', createTemplateSchema);
  r.register('UpdateCapabilityTemplateInput', updateTemplateSchema);
  r.register('CreateBarChitInput', createBarChitSchema);

  r.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
  });

  // Sketch a handful of paths — full coverage can be added later.
  r.registerPath({
    method: 'get', path: '/api/v1/me', summary: 'Get current user', tags: ['Auth'],
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'OK' }, 401: { description: 'Unauthenticated' } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/auth/sign-in', summary: 'Sign in', tags: ['Auth'],
    request: { body: { content: { 'application/json': { schema: signInSchema } } } },
    responses: { 200: { description: 'OK' }, 401: { description: 'Bad credentials' }, 422: { description: 'Invalid input' } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/items', summary: 'List items', tags: ['Items'],
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'OK' } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/items', summary: 'Create item', tags: ['Items'],
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: createItemApiSchema } } } },
    responses: { 201: { description: 'Created' }, 422: { description: 'Invalid input' } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/units', summary: 'List units', tags: ['Units'],
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'OK' } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/users', summary: 'Invite user', tags: ['Users'],
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: inviteUserSchema } } } },
    responses: { 201: { description: 'Invited' }, 403: { description: 'Forbidden' } },
  });
  r.registerPath({
    method: 'get', path: '/api/v1/bar/chits', summary: 'List bar chits', tags: ['Bar'],
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'OK' } },
  });
  r.registerPath({
    method: 'post', path: '/api/v1/bar/chits', summary: 'Create bar chit', tags: ['Bar'],
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: createBarChitSchema } } } },
    responses: { 201: { description: 'Created' }, 422: { description: 'Invalid input' } },
  });

  return new OpenApiGeneratorV31(r.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Officers Mess API', version: '1.0.0' },
    servers: [{ url: '/' }],
  });
}

export const GET = withRoute(async () => {
  if (!cached) cached = build();
  return ok(cached);
});
