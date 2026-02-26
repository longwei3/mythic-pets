'use client';

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { MovementInput } from '@/features/adventure3d/core/types';

interface AdventureInputSnapshot {
  movementRef: MutableRefObject<MovementInput>;
  jumpNonce: number;
  attackNonce: number;
  gatherNonce: number;
  targetNonce: number;
  viewToggleNonce: number;
}

function createDefaultMovementInput(): MovementInput {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };
}

export function useAdventureInput(enabled: boolean): AdventureInputSnapshot {
  const movementRef = useRef<MovementInput>(createDefaultMovementInput());
  const [jumpNonce, setJumpNonce] = useState(0);
  const [attackNonce, setAttackNonce] = useState(0);
  const [gatherNonce, setGatherNonce] = useState(0);
  const [targetNonce, setTargetNonce] = useState(0);
  const [viewToggleNonce, setViewToggleNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      movementRef.current = createDefaultMovementInput();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const next = { ...movementRef.current };

      if (event.code === 'KeyW' || event.code === 'ArrowUp') {
        next.forward = true;
      }
      if (event.code === 'KeyS' || event.code === 'ArrowDown') {
        next.backward = true;
      }
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
        next.left = true;
      }
      if (event.code === 'KeyD' || event.code === 'ArrowRight') {
        next.right = true;
      }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        next.sprint = true;
      }

      if (!event.repeat && event.code === 'Space') {
        event.preventDefault();
        setJumpNonce((prev) => prev + 1);
      }
      if (!event.repeat && event.code === 'KeyJ') {
        setAttackNonce((prev) => prev + 1);
      }
      if (!event.repeat && event.code === 'KeyE') {
        setGatherNonce((prev) => prev + 1);
      }
      if (!event.repeat && event.code === 'Tab') {
        event.preventDefault();
        setTargetNonce((prev) => prev + 1);
      }
      if (!event.repeat && event.code === 'KeyV') {
        setViewToggleNonce((prev) => prev + 1);
      }

      movementRef.current = next;
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const next = { ...movementRef.current };

      if (event.code === 'KeyW' || event.code === 'ArrowUp') {
        next.forward = false;
      }
      if (event.code === 'KeyS' || event.code === 'ArrowDown') {
        next.backward = false;
      }
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
        next.left = false;
      }
      if (event.code === 'KeyD' || event.code === 'ArrowRight') {
        next.right = false;
      }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        next.sprint = false;
      }

      movementRef.current = next;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      movementRef.current = createDefaultMovementInput();
    };
  }, [enabled]);

  return useMemo(
    () => ({
      movementRef,
      jumpNonce,
      attackNonce,
      gatherNonce,
      targetNonce,
      viewToggleNonce,
    }),
    [jumpNonce, attackNonce, gatherNonce, targetNonce, viewToggleNonce],
  );
}
