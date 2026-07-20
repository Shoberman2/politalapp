import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '../../src/utils/clipboard'

// Regression: ISSUE-004 — a Clipboard API permission rejection made the bill
// Share action fail without attempting a selection-based browser fallback.
// Found by /qa on 2026-07-10.

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const originalExecCommand = document.execCommand

function setClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard)
  } else {
    delete navigator.clipboard
  }
  document.execCommand = originalExecCommand
  document.querySelectorAll('textarea').forEach((element) => element.remove())
})

describe('copyTextToClipboard regression', () => {
  it('uses the Clipboard API when permission is granted', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const execCommand = vi.fn(() => true)
    setClipboard({ writeText })
    document.execCommand = execCommand

    await expect(copyTextToClipboard('https://example.test/bill')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://example.test/bill')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('falls back to a temporary textarea when Clipboard API access is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    const execCommand = vi.fn(() => true)
    setClipboard({ writeText })
    document.execCommand = execCommand

    await expect(copyTextToClipboard('https://example.test/bill')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('reports failure when neither copy mechanism is available', async () => {
    setClipboard(undefined)
    document.execCommand = undefined

    await expect(copyTextToClipboard('https://example.test/bill')).resolves.toBe(false)
  })
})
