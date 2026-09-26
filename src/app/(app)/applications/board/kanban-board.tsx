"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { StatusBadge } from "@/components/status-badge";
import type { Status } from "@/generated/prisma/enums";
import { moveApplication } from "@/lib/applications/actions";
import { canTransition } from "@/lib/pipeline/transitions";

export type BoardCard = {
  id: string;
  role: string;
  company: string;
  status: Status;
  followUpDue: boolean;
};

// Two rows. The top one is where the work happens, the bottom one is where
// applications end up. Closed ones pile up over time, and keeping them apart
// stops them from crowding out the ones that still need something from you.
const OPEN_COLUMNS: readonly Status[] = ["DRAFT", "APPLIED", "SCREENING", "INTERVIEW", "OFFER"];
const CLOSED_COLUMNS: readonly Status[] = ["ACCEPTED", "REJECTED", "DECLINED", "WITHDRAWN"];

/** Staying in the same column is not a move, everything else asks the rules. */
function canDrop(card: BoardCard, column: Status): boolean {
  return card.status !== column && canTransition(card.status, column);
}

/**
 * With a mouse or a finger, the column under the pointer wins. The keyboard has
 * no pointer, so there the rectangle of the lifted card decides.
 */
const collisionDetection: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  return underPointer.length > 0 ? underPointer : rectIntersection(args);
};

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

/**
 * By default the arrow keys nudge a lifted card a few pixels per press, which
 * takes a dozen presses to cross one column. This jumps straight to the next
 * column in that direction instead. Columns the card cannot go to are disabled
 * while it is lifted, so the keys only ever land on allowed ones.
 */
const jumpBetweenColumns: KeyboardCoordinateGetter = (event, { context }) => {
  if (!ARROW_KEYS.includes(event.code)) {
    return undefined;
  }

  event.preventDefault();

  const { active, collisionRect, droppableRects, droppableContainers } = context;

  if (!active || !collisionRect) {
    return undefined;
  }

  const candidates = droppableContainers.getEnabled().filter((container) => {
    const rect = droppableRects.get(container.id);

    if (!rect) return false;

    switch (event.code) {
      case "ArrowRight":
        return rect.left > collisionRect.left;
      case "ArrowLeft":
        return rect.left < collisionRect.left;
      case "ArrowDown":
        return rect.top > collisionRect.top;
      default:
        return rect.top < collisionRect.top;
    }
  });

  const [closest] = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: candidates,
    pointerCoordinates: null,
  });

  const target = closest ? droppableRects.get(closest.id) : undefined;

  // Just inside the column, below its header, so the card overlaps it clearly.
  return target ? { x: target.left + 12, y: target.top + 44 } : undefined;
};

export function KanbanBoard({ cards }: { cards: BoardCard[] }) {
  // The board shows this list, not `cards` directly. A move changes it at once,
  // and when the server has answered, React replaces it with whatever the fresh
  // render of the page says. A refused move therefore snaps back by itself.
  const [optimisticCards, applyMove] = useOptimistic(
    cards,
    (current, move: { id: string; to: Status }) =>
      current.map((card) => (card.id === move.id ? { ...card, status: move.to } : card)),
  );
  const [isSaving, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a plain click on the
    // title still opens the application.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On a touch screen a short press lifts the card, a quick swipe scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: jumpBetweenColumns }),
  );

  const activeCard = optimisticCards.find((card) => card.id === activeId) ?? null;

  function describe(id: UniqueIdentifier): string {
    const card = optimisticCards.find((candidate) => candidate.id === id);
    return card ? `${card.role} at ${card.company}` : "The application";
  }

  // Read out by screen readers. The defaults would announce raw ids.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${describe(active.id)} is over ${String(over.id).toLowerCase()}.`
        : `${describe(active.id)} is not over a column that takes it.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${describe(active.id)} was moved to ${String(over.id).toLowerCase()}.`
        : `${describe(active.id)} was put back.`,
    onDragCancel: ({ active }) => `Moving ${describe(active.id)} was cancelled.`,
  };

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setNotice(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);

    const card = optimisticCards.find((candidate) => candidate.id === active.id);

    if (!card || !over) {
      return;
    }

    // Column ids are statuses. Anything else fails canTransition anyway.
    const to = over.id as Status;

    if (!canDrop(card, to)) {
      return;
    }

    startTransition(async () => {
      applyMove({ id: card.id, to });

      try {
        const result = await moveApplication(card.id, to);

        if (!result.ok) {
          setNotice(result.message);
        }
      } catch {
        setNotice("The server could not be reached, so the card went back.");
      }
    });
  }

  return (
    <DndContext
      // A fixed id keeps the generated accessibility ids equal on server and
      // client. Without it React warns about a hydration mismatch.
      id="application-board"
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col gap-8">
        <ColumnRow
          title="In progress"
          statuses={OPEN_COLUMNS}
          cards={optimisticCards}
          activeCard={activeCard}
          aside={
            <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
              {notice ?? (isSaving ? "Saving..." : "")}
            </p>
          }
        />
        <ColumnRow
          title="Closed"
          statuses={CLOSED_COLUMNS}
          cards={optimisticCards}
          activeCard={activeCard}
        />
      </div>

      <DragOverlay>
        {activeCard ? (
          <div className="cursor-grabbing rounded-md border border-zinc-300 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <CardBody card={activeCard} handle={<GripIcon />} asLink={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ColumnRow({
  title,
  statuses,
  cards,
  activeCard,
  aside,
}: {
  title: string;
  statuses: readonly Status[];
  cards: BoardCard[];
  activeCard: BoardCard | null;
  aside?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{title}</h2>
        {aside}
      </div>
      <div className={`grid gap-3 ${statuses.length === 5 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
        {statuses.map((status) => (
          <Column
            key={status}
            status={status}
            cards={cards.filter((card) => card.status === status)}
            activeCard={activeCard}
          />
        ))}
      </div>
    </section>
  );
}

function Column({
  status,
  cards,
  activeCard,
}: {
  status: Status;
  cards: BoardCard[];
  activeCard: BoardCard | null;
}) {
  const accepts = activeCard !== null && canDrop(activeCard, status);

  // While a card is lifted, every column it cannot go to is switched off. It
  // then takes no drop and is skipped by the arrow keys as well.
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: activeCard !== null && !accepts,
  });

  let look = "border-zinc-200 dark:border-zinc-800";

  if (activeCard !== null) {
    if (accepts && isOver) {
      look = "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-900";
    } else if (accepts) {
      look = "border-dashed border-zinc-400 dark:border-zinc-500";
    } else if (activeCard.status !== status) {
      look = "border-zinc-200 opacity-40 dark:border-zinc-800";
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-32 flex-col gap-3 rounded-lg border p-3 transition-colors ${look}`}
    >
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        <span className="text-xs text-zinc-500">{cards.length}</span>
      </div>
      {cards.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-600">Nothing here</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <Card key={card.id} card={card} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Card({ card }: { card: BoardCard }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: card.id,
  });

  // dnd-kit hands over all its handlers in one bag, typed as plain functions.
  // Mouse and touch go on the whole card, the keyboard only on the handle, so
  // the title inside stays an ordinary link for anyone using the keyboard.
  const onMouseDown = listeners?.onMouseDown as React.MouseEventHandler | undefined;
  const onTouchStart = listeners?.onTouchStart as React.TouchEventHandler | undefined;
  const onKeyDown = listeners?.onKeyDown as React.KeyboardEventHandler | undefined;

  return (
    <li
      ref={setNodeRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={`cursor-grab rounded-md border border-zinc-200 bg-white p-3 shadow-sm select-none dark:border-zinc-800 dark:bg-zinc-950 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <CardBody
        card={card}
        handle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            onKeyDown={onKeyDown}
            {...attributes}
            aria-label={`Move ${card.role} at ${card.company}`}
            className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300"
          >
            <GripIcon />
          </button>
        }
      />
    </li>
  );
}

function CardBody({
  card,
  handle,
  asLink = true,
}: {
  card: BoardCard;
  handle: React.ReactNode;
  /** Off for the copy that follows the pointer, which is only a picture. */
  asLink?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        {asLink ? (
          <Link
            href={`/applications/${card.id}`}
            // Browsers let you drag links out of a page by default, which would
            // cancel the board's own drag halfway through.
            draggable={false}
            className="text-sm font-medium hover:underline"
          >
            {card.role}
          </Link>
        ) : (
          <span className="text-sm font-medium">{card.role}</span>
        )}
        {handle}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{card.company}</p>
      {card.followUpDue && (
        <span className="mt-1 self-start rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          Follow-up due
        </span>
      )}
    </div>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2" r="1.5" />
      <circle cx="8" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="2" cy="14" r="1.5" />
      <circle cx="8" cy="14" r="1.5" />
    </svg>
  );
}
