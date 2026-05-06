# Kitchen Relay — Ticket Printing (L4)

**Structurizr:** `kitchen.relay.ticket_printing`  
**Doc file (kebab-case):** `docs/UML/kitchen-relay-ticket-printing.md`

This UML class diagram documents the code-level printer abstraction implemented in `kitchen-relay/src/print.ts`.

```mermaid
classDiagram
    class PrinterAdapter {
      <<interface>>
      +print(text: string) Promise~void~
    }

    class LpPrinterOptions {
      +destination?: string
      +title?: string
    }

    class ConsolePrinterOptions {
      +logFilePath?: string
    }

    class LpPrinterAdapter {
      -options: LpPrinterOptions
      +print(text: string) Promise~void~
    }

    class ConsolePrinterAdapter {
      -options: ConsolePrinterOptions
      +print(text: string) Promise~void~
    }

    class TicketFormatter {
      <<utility>>
      +formatTicket(paymentIntentId, amountCents, currency, lines, printedAt) string
    }

    class PrintRetryOptions {
      +maxAttempts: number
      +initialDelayMs: number
    }

    class PrintRetryPolicy {
      <<utility>>
      +printWithRetries(adapter, text, retries) Promise~void~
      -sleep(ms: number) Promise~void~
    }

    class LpProcessGateway {
      <<utility>>
      -runLp(args: string[], stdin: string) Promise~void~
    }

    class DeadLetterWriter {
      <<utility>>
      +appendDeadLetter(path, text, meta) Promise~void~
    }

    PrinterAdapter <|.. LpPrinterAdapter
    PrinterAdapter <|.. ConsolePrinterAdapter

    LpPrinterAdapter --> LpPrinterOptions : holds
    ConsolePrinterAdapter --> ConsolePrinterOptions : holds
    LpPrinterAdapter ..> LpProcessGateway : uses

    PrintRetryPolicy ..> PrinterAdapter : depends on
    PrintRetryPolicy ..> PrintRetryOptions : consumes
```
