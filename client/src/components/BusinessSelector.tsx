import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Icon from "./Icon";
import type { Business } from "../lib/types";

interface BusinessSelectorProps {
  businesses: Business[];
  selectedId: string;
  onSelect: (businessId: string) => void;
}

export default function BusinessSelector({
  businesses,
  selectedId,
  onSelect,
}: BusinessSelectorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef("");
  const typeaheadTimeout = useRef<number | undefined>(undefined);
  const listboxId = useId();
  const selectedIndex = Math.max(
    businesses.findIndex((business) => business._id === selectedId),
    0,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedBusiness = businesses[selectedIndex];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === "Tab") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function toggleListbox() {
    setActiveIndex(selectedIndex);
    setIsOpen((open) => !open);
  }

  function selectBusiness(index: number) {
    const business = businesses[index];
    if (!business) {
      return;
    }
    onSelect(business._id);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!businesses.length) {
      return;
    }

    if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      typeahead.current += event.key.toLocaleLowerCase();
      window.clearTimeout(typeaheadTimeout.current);
      typeaheadTimeout.current = window.setTimeout(() => {
        typeahead.current = "";
      }, 700);

      const startIndex = isOpen ? activeIndex + 1 : selectedIndex + 1;
      const orderedBusinesses = [
        ...businesses.slice(startIndex),
        ...businesses.slice(0, startIndex),
      ];
      const match = orderedBusinesses.find((business) =>
        business.name.toLocaleLowerCase().startsWith(typeahead.current),
      );
      if (match) {
        const matchIndex = businesses.findIndex(
          (business) => business._id === match._id,
        );
        setActiveIndex(matchIndex);
        setIsOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!isOpen) {
        setActiveIndex(selectedIndex);
        setIsOpen(true);
      } else {
        setActiveIndex((current) =>
          (current + direction + businesses.length) % businesses.length,
        );
      }
      return;
    }

    if (isOpen && event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (isOpen && event.key === "End") {
      event.preventDefault();
      setActiveIndex(businesses.length - 1);
    } else if (isOpen && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectBusiness(activeIndex);
    }
  }

  return (
    <div className="business-select-wrap" ref={rootRef}>
      <Icon className="size-4 text-muted" name="briefcase" />
      <button
        aria-activedescendant={isOpen ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Select business: ${selectedBusiness?.name ?? "Choose a business"}`}
        className="business-select"
        onClick={toggleListbox}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        {selectedBusiness?.name ?? "Choose a business"}
      </button>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close business options" : "Open business options"}
        className="business-select-caret"
        onClick={toggleListbox}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <Icon className="dropdown-select-chevron" name="selectChevron" />
      </button>
      {isOpen ? (
        <div
          aria-label="Businesses"
          className="business-select-menu"
          id={listboxId}
          role="listbox"
        >
          {businesses.map((business, index) => {
            const selected = business._id === selectedId;
            const active = index === activeIndex;
            return (
              <div
                aria-selected={selected}
                className={[
                  "business-select-option",
                  active ? "business-select-option-active" : "",
                  selected ? "business-select-option-selected" : "",
                ].filter(Boolean).join(" ")}
                id={`${listboxId}-option-${index}`}
                key={business._id}
                onClick={() => selectBusiness(index)}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setActiveIndex(index)}
                role="option"
              >
                <span className="truncate">{business.name}</span>
                {selected ? <Icon className="size-4" name="check" /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
