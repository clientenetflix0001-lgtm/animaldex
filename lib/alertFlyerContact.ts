import type { AlertCreatePrimaryId, AlertType } from './alerts.ts';
import {
  ADOPTION_CONTACT_REQUIRED,
  parseProtectorAdoptionContact,
  type ParsedAdoptionContact,
} from './adoptionContact.ts';

/** Mismo parser que Adopción personal. No hay reglas por tipo. */
export function parsePersonalAlertContact(
  whatsappRaw: unknown,
  phoneRaw: unknown
): ParsedAdoptionContact {
  return parseProtectorAdoptionContact('protector', whatsappRaw, phoneRaw);
}

/**
 * Adopción personal: siempre (alerta o flyer).
 * Perdido / visto / encontrado: solo en Crear Flyer.
 * Protector en adopción: usa el contacto de la Página, no este formulario.
 */
export function shouldCollectPersonalAlertContact(input: {
  type: AlertType | null;
  primary: AlertCreatePrimaryId;
  flyerMode: boolean;
  isProtector: boolean;
}): boolean {
  if (input.primary === 'adoption' || input.type === 'adoption') {
    return !input.isProtector;
  }
  if (!input.flyerMode) return false;
  return (
    input.primary === 'lost' ||
    input.primary === 'seen-or-found' ||
    input.type === 'lost' ||
    input.type === 'found' ||
    input.type === 'sighting'
  );
}

export function personalAlertContactLabel(type: AlertType | null): string {
  return type === 'adoption' ? 'Contacto para adopción *' : 'Contacto *';
}

export function personalAlertContactHelp(type: AlertType | null): string {
  return type === 'adoption'
    ? 'Agregá al menos un WhatsApp o teléfono. No se muestra en el feed.'
    : 'Agregá al menos un WhatsApp o teléfono.';
}

export function personalAlertContactError(parsed: ParsedAdoptionContact): string {
  if (parsed.ok) return '';
  return parsed.error || ADOPTION_CONTACT_REQUIRED;
}
