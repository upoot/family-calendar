import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

interface Props {
  id: string;
  onClick: () => void;
  children: ReactNode;
}

export default function DroppableCell({ id, onClick, children }: Props) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`cell ${isOver ? 'drag-over' : ''}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
