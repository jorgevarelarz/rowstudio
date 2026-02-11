import Foundation
import PDFKit
import Vision
import AppKit

func die(_ message: String) -> Never {
  fputs(message + "\n", stderr)
  exit(1)
}

let args = CommandLine.arguments
if args.count < 2 {
  die("Usage: extract_pdf_text.swift /path/to/file.pdf [--render-dir /tmp/out] [--width 1600]")
}

let inputPath = args[1]
var renderDir: String? = nil
var targetWidth: CGFloat = 1600
var pageStart: Int? = nil
var pageEnd: Int? = nil

var i = 2
while i < args.count {
  switch args[i] {
  case "--render-dir":
    guard i + 1 < args.count else { die("Missing value for --render-dir") }
    renderDir = args[i + 1]
    i += 2
  case "--width":
    guard i + 1 < args.count else { die("Missing value for --width") }
    guard let w = Double(args[i + 1]) else { die("Invalid --width value") }
    targetWidth = CGFloat(w)
    i += 2
  case "--pages":
    guard i + 1 < args.count else { die("Missing value for --pages") }
    // Format: "3" or "3-12" (1-based, inclusive)
    let spec = args[i + 1]
    if let dash = spec.firstIndex(of: "-") {
      let a = String(spec[..<dash])
      let b = String(spec[spec.index(after: dash)...])
      guard let s = Int(a), let e = Int(b), s >= 1, e >= s else { die("Invalid --pages range: \(spec)") }
      pageStart = s
      pageEnd = e
    } else {
      guard let s = Int(spec), s >= 1 else { die("Invalid --pages value: \(spec)") }
      pageStart = s
      pageEnd = s
    }
    i += 2
  default:
    die("Unknown arg: \(args[i])")
  }
}

let url = URL(fileURLWithPath: inputPath)
guard let doc = PDFDocument(url: url) else {
  die("Failed to open PDF: \(inputPath)")
}

func cgImage(from image: NSImage) -> CGImage? {
  var rect = CGRect(origin: .zero, size: image.size)
  return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func renderPage(_ page: PDFPage, to path: String, width: CGFloat) -> CGImage? {
  let bounds = page.bounds(for: .mediaBox)
  let height = max(1, Int((bounds.height / max(bounds.width, 1)) * width))
  let thumb = page.thumbnail(of: NSSize(width: width, height: CGFloat(height)), for: .mediaBox)
  guard let cg = cgImage(from: thumb) else { return nil }

  // Save PNG
  let rep = NSBitmapImageRep(cgImage: cg)
  if let data = rep.representation(using: .png, properties: [:]) {
    try? data.write(to: URL(fileURLWithPath: path))
  }

  return cg
}

func ocr(_ image: CGImage) -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.recognitionLanguages = ["es", "en"]

  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return ""
  }

  guard let results = request.results else {
    return ""
  }

  let lines = results.compactMap { $0.topCandidates(1).first?.string }
  return lines.joined(separator: "\n")
}

let count = doc.pageCount
print("PDF pages: \(count)")

let fm = FileManager.default
if let renderDir {
  try? fm.createDirectory(atPath: renderDir, withIntermediateDirectories: true)
}

let startIdx = max(0, (pageStart ?? 1) - 1)
let endIdx = min(count - 1, (pageEnd ?? count) - 1)
if startIdx > endIdx {
  die("Invalid page range after clamping: \(startIdx + 1)-\(endIdx + 1)")
}

for idx in startIdx...endIdx {
  guard let page = doc.page(at: idx) else { continue }

  var cgImage: CGImage? = nil
  if let renderDir {
    let filename = String(format: "page-%02d.png", idx + 1)
    let outPath = (renderDir as NSString).appendingPathComponent(filename)
    cgImage = renderPage(page, to: outPath, width: targetWidth)
  }

  if cgImage == nil {
    // Render in-memory for OCR if needed.
    let tmpDir = NSTemporaryDirectory()
    let outPath = (tmpDir as NSString).appendingPathComponent("_tmp_ocr_page.png")
    cgImage = renderPage(page, to: outPath, width: targetWidth)
  }

  let text = cgImage.map(ocr) ?? ""

  print("\n=== Page \(idx + 1) ===")
  print(text.trimmingCharacters(in: .whitespacesAndNewlines))
}
