import type { RuleId } from '../../domain/types';
import { ruleDef } from '../../engine/rules';

export function ruleDefinitionText(id: RuleId): string {
  const def = ruleDef(id);
  return `Control "${def.id}" — ${def.description} ${
    def.blocking
      ? 'Open exceptions from this control block dependent publication.'
      : 'This control reports without blocking publication.'
  }`;
}
