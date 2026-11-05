import React, { useCallback, useRef, useState } from 'react';
import { db, type ApiAlert } from '../../lib/db';
import { openAlertAdoption } from '../../lib/openAlertAdoption';
import { PUBLIC_WEB_ORIGIN } from '../../lib/publicWeb';
import { adoptionPostPath } from '../../lib/adoptionLocalities';
import { FlyerContactModal } from './FlyerContactModal';
import { FlyerViewer } from './FlyerViewer';

export function adoptionPostShareUrl(citySlug: string, alertId: string): string {
  return `${PUBLIC_WEB_ORIGIN}${adoptionPostPath(citySlug, alertId)}`;
}

/**
 * "Quiero adoptar…" en Animaldex Adopciones.
 * - Con contacto estructurado: el comportamiento actual (openAlertAdoption).
 * - Flyer sin contacto estructurado: modal "¿Querés adoptar esta mascota?"
 *   y, con "Ver flyer", el flyer original a pantalla completa.
 */
export function useAdoptionPostActions() {
  const [modalAlert, setModalAlert] = useState<ApiAlert | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const busy = useRef(false);

  const adopt = useCallback(async (alert: ApiAlert) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (alert.mediaKind === 'flyer') {
        let hasContact = false;
        try {
          const res = await db.alertAdoptionContact(alert.id);
          hasContact = !!(res.adoptionWhatsapp || res.adoptionPhone || res.shelterProfileId);
        } catch {}
        if (!hasContact) {
          setModalAlert(alert);
          return;
        }
      }
      await openAlertAdoption(alert);
    } finally {
      busy.current = false;
    }
  }, []);

  const viewFlyer = useCallback((alert: ApiAlert) => setViewerUri(alert.image), []);

  const overlays = (
    <>
      <FlyerContactModal
        visible={!!modalAlert}
        onClose={() => setModalAlert(null)}
        onViewFlyer={() => {
          const uri = modalAlert?.image || null;
          setModalAlert(null);
          setViewerUri(uri);
        }}
      />
      <FlyerViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );

  return { adopt, viewFlyer, overlays };
}
