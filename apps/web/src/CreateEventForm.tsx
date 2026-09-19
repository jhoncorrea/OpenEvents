import {
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  EventCreationError,
  type CreatedEvent,
} from "./api-events";
import {
  clearEventDraft,
  readEventDraft,
  saveEventDraft,
} from "./event-draft";
import {
  validateEventForm,
  type CreateEventPayload,
  type EventFormErrors,
  type EventFormValues,
} from "./event-form";
import "./event-form.css";

interface CreateEventFormProps {
  accountStorageKey: string;
  disabled: boolean;
  onCreate: (input: CreateEventPayload) => Promise<CreatedEvent>;
  onAccessInvalidated: () => void;
  onDraftStorageChange: (available: boolean) => void;
}

const initialValues: EventFormValues = {
  name: "",
  slug: "",
  startsAt: "",
  endsAt: "",
  timezone: "America/Lima",
  location: "",
};

const fields = [
  {
    name: "name",
    label: "Nombre del evento",
    type: "text",
    maxLength: 200,
  },
  {
    name: "slug",
    label: "Identificador del evento (slug)",
    type: "text",
    maxLength: 120,
  },
  {
    name: "startsAt",
    label: "Fecha y hora de inicio",
    type: "datetime-local",
  },
  {
    name: "endsAt",
    label: "Fecha y hora de fin",
    type: "datetime-local",
  },
  {
    name: "timezone",
    label: "Zona horaria",
    type: "text",
    maxLength: 100,
  },
  {
    name: "location",
    label: "Ubicación",
    type: "text",
    maxLength: 500,
  },
] as const;

export default function CreateEventForm({
  accountStorageKey,
  disabled,
  onCreate,
  onAccessInvalidated,
  onDraftStorageChange,
}: CreateEventFormProps) {
  const [restoredDraft] = useState(() =>
    readEventDraft(accountStorageKey),
  );

  const [values, setValues] = useState<EventFormValues>(
    () => restoredDraft?.values ?? { ...initialValues },
  );

  const [outcomeUncertain, setOutcomeUncertain] = useState(
    restoredDraft?.outcomeUncertain ?? false,
  );

  const [storageError, setStorageError] = useState<string | null>(null);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] =
    useState<CreatedEvent | null>(null);
  const [pending, setPending] = useState(false);

  const submissionLock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const blocked = disabled || pending;

  function persistDraft(
    nextValues: EventFormValues,
    uncertain: boolean,
  ): boolean {
    const saved = saveEventDraft(accountStorageKey, {
      values: nextValues,
      outcomeUncertain: uncertain,
    });

    onDraftStorageChange(saved);
    setStorageError(
      saved
        ? null
        : "No pudimos guardar el borrador en este navegador. Conserva una copia de los campos antes de salir o renovar la autorización.",
    );

    return saved;
  }

  function updateField(field: keyof EventFormValues, value: string) {
    const nextValues = { ...values, [field]: value };

    setValues(nextValues);
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    persistDraft(nextValues, outcomeUncertain);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (blocked || submissionLock.current || createdEvent) {
      return;
    }

    const result = validateEventForm(values);

    setMessage(null);
    setErrors({});

    if (!result.success) {
      setErrors(result.errors);

      const firstInvalid = fields.find(
        (field) => result.errors[field.name],
      );

      if (firstInvalid) {
        const input = formRef.current?.elements.namedItem(
          firstInvalid.name,
        );

        if (input instanceof HTMLInputElement) {
          input.focus();
        }
      }

      return;
    }

    // Una interrupción durante el envío no demuestra que la creación falló.
    if (!persistDraft(values, true)) {
      return;
    }

    const previousUncertainty = outcomeUncertain;

    submissionLock.current = true;
    setPending(true);

    try {
      const savedEvent = await onCreate(result.data);

      setCreatedEvent(savedEvent);
      setOutcomeUncertain(false);

      const cleared = clearEventDraft(accountStorageKey);

      onDraftStorageChange(cleared);
      setStorageError(
        cleared
          ? null
          : "El evento se creó, pero no pudimos eliminar el borrador local. Conserva el identificador de la confirmación.",
      );
    } catch (error) {
      const uncertain =
        previousUncertainty ||
        !(error instanceof EventCreationError) ||
        error.kind === "uncertain";

      setOutcomeUncertain(uncertain);
      persistDraft(values, uncertain);

      if (error instanceof EventCreationError) {
        setMessage(error.message);

        if (error.kind === "conflict") {
          setErrors({
            slug: "Este identificador ya está utilizado.",
          });
        }

        if (
          error.kind === "interaction_required" ||
          error.kind === "authentication" ||
          error.kind === "unauthorized" ||
          error.kind === "forbidden"
        ) {
          onAccessInvalidated();
        }
      } else {
        setMessage(
          "No pudimos confirmar el resultado. El evento podría haberse guardado. Verifica el resultado antes de volver a enviarlo.",
        );
      }
    } finally {
      submissionLock.current = false;
      setPending(false);
    }
  }

  function startAnotherEvent() {
    if (blocked || submissionLock.current) {
      return;
    }

    const nextValues = { ...initialValues };

    if (!persistDraft(nextValues, false)) {
      return;
    }

    setValues(nextValues);
    setOutcomeUncertain(false);
    setErrors({});
    setMessage(null);
    setCreatedEvent(null);
  }

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <section
      className="event-creation-panel"
      aria-labelledby="event-creation-title"
    >
      <h2 id="event-creation-title">Crear evento</h2>

      {storageError && <p role="alert">{storageError}</p>}

      {outcomeUncertain && !createdEvent && (
        <p role="alert">
          Hay un envío cuyo resultado no se confirmó. El evento podría
          estar guardado. Verifica el resultado antes de enviar otra
          solicitud, incluso si cambias el slug.
        </p>
      )}

      <div role="status" aria-live="polite">
        {createdEvent && (
          <div className="event-creation-success">
            <h3>Evento creado correctamente</h3>

            <dl>
              <dt>Nombre</dt>
              <dd>{createdEvent.name}</dd>

              <dt>Identificador</dt>
              <dd>{createdEvent.id}</dd>

              <dt>Slug</dt>
              <dd>{createdEvent.slug}</dd>

              <dt>Estado</dt>
              <dd>Borrador (draft)</dd>

              <dt>Inicio en UTC</dt>
              <dd>{createdEvent.startsAt}</dd>

              <dt>Fin en UTC</dt>
              <dd>{createdEvent.endsAt}</dd>

              <dt>Zona horaria</dt>
              <dd>{createdEvent.timezone}</dd>

              <dt>Ubicación</dt>
              <dd>{createdEvent.location}</dd>
            </dl>

            <button
              type="button"
              disabled={blocked}
              onClick={startAnotherEvent}
            >
              Crear otro evento
            </button>
          </div>
        )}
      </div>

      {!createdEvent && (
        <form
          ref={formRef}
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          aria-busy={pending}
        >
          <p id="event-timezone-help">
            Las horas de inicio y fin corresponden a la zona horaria
            indicada para el evento.
          </p>

          <p id="event-slug-help">
            El slug debe ser único. Usa minúsculas, números y guiones;
            por ejemplo, devopsdays-lima-2027.
          </p>

          <fieldset disabled={blocked}>
            <legend>Datos del evento</legend>

            <div className="event-form-grid">
              {fields.map((field) => {
                const id = `event-${field.name}`;
                const errorId = `${id}-error`;

                const helpId =
                  field.name === "slug"
                    ? "event-slug-help"
                    : field.name === "startsAt" ||
                        field.name === "endsAt" ||
                        field.name === "timezone"
                      ? "event-timezone-help"
                      : undefined;

                const describedBy = [
                  helpId,
                  errors[field.name] ? errorId : undefined,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div className="event-form-field" key={field.name}>
                    <label htmlFor={id}>{field.label}</label>

                    <input
                      id={id}
                      name={field.name}
                      type={field.type}
                      value={values[field.name]}
                      maxLength={
                        "maxLength" in field
                          ? field.maxLength
                          : undefined
                      }
                      step={
                        field.type === "datetime-local"
                          ? 60
                          : undefined
                      }
                      autoComplete="off"
                      required
                      aria-invalid={Boolean(errors[field.name])}
                      aria-describedby={describedBy || undefined}
                      onChange={(event) =>
                        updateField(field.name, event.target.value)
                      }
                    />

                    {errors[field.name] && (
                      <p id={errorId} className="event-field-error">
                        {errors[field.name]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <button type="submit">
              {pending ? "Creando evento…" : "Crear evento"}
            </button>
          </fieldset>

          {hasErrors && (
            <p role="alert">
              Revisa los campos señalados antes de continuar.
            </p>
          )}

          {message && <p role="alert">{message}</p>}

          <p role="status" aria-live="polite">
            {pending ? "Enviando los datos del evento…" : ""}
          </p>
        </form>
      )}
    </section>
  );
}