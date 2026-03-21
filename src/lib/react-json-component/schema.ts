import { z } from 'zod';

import type { ActionBinding, JsonPropValue, JsonASTNode } from './types';

/**
 * Zod Schema for ActionBinding.
 * Used for binding function execution in JSON.
 */
export const ActionBindingSchema: z.ZodType<ActionBinding> = z.object({
  action: z.string(),
  args: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  serverAction: z.boolean().optional(),
});

/**
 * Zod Schema for JsonPropValue.
 * Supports primitives, nested dictionaries, and action bindings.
 */
export const JsonPropValueSchema: z.ZodType<JsonPropValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    ActionBindingSchema,
    z.record(z.string(), JsonPropValueSchema),
  ])
);

/**
 * Zod Schema for JsonASTNode.
 * Can be used defensively for parsing unknown/remote inputs.
 */
export const JsonASTNodeSchema: z.ZodType<JsonASTNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    props: z.record(z.string(), JsonPropValueSchema).optional(),
    children: z.array(z.union([z.string(), JsonASTNodeSchema])).optional(),
    contextName: z.string().optional(),
    $if: z.string().optional(),
    $each: z.string().optional(),
    $key: z.string().optional(),
    $as: z.string().optional(),
    $indexAs: z.string().optional(),
  })
);
