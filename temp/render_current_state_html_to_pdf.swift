import Foundation
import AppKit
import PDFKit

struct Job {
    let html: String
    let pdf: String
}

let root = "/Users/kushaltrivedi/Documents/GitHub/hushh-research/temp"
let jobs = [
    Job(
        html: "\(root)/Hushh-Master-Engineering-Specification-v1_0.current-state.html",
        pdf: "\(root)/Hushh-Master-Engineering-Specification-v1_0.current-state.pdf"
    ),
    Job(
        html: "\(root)/Hushh-Product-Specification-v2_0.current-state.html",
        pdf: "\(root)/Hushh-Product-Specification-v2_0.current-state.pdf"
    ),
]

let pageSize = NSSize(width: 612, height: 792)
let margin: CGFloat = 54
let contentWidth = pageSize.width - (margin * 2)

func renderPDF(htmlPath: String, outputPath: String) throws -> Int {
    let htmlURL = URL(fileURLWithPath: htmlPath)
    let html = try Data(contentsOf: htmlURL)
    let attributed = try NSAttributedString(
        data: html,
        options: [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue,
            .baseURL: htmlURL.deletingLastPathComponent(),
        ],
        documentAttributes: nil
    )

    let textView = NSTextView(frame: NSRect(x: 0, y: 0, width: contentWidth, height: 10))
    textView.isRichText = true
    textView.isEditable = false
    textView.drawsBackground = false
    textView.textContainerInset = NSSize(width: 0, height: 0)
    textView.textContainer?.lineFragmentPadding = 0
    textView.textContainer?.containerSize = NSSize(width: contentWidth, height: .greatestFiniteMagnitude)
    textView.textContainer?.widthTracksTextView = false
    textView.textStorage?.setAttributedString(attributed)
    textView.layoutManager?.ensureLayout(for: textView.textContainer!)
    let used = textView.layoutManager?.usedRect(for: textView.textContainer!) ?? .zero
    textView.frame = NSRect(x: 0, y: 0, width: contentWidth, height: ceil(used.height))

    let container = NSView(frame: NSRect(x: 0, y: 0, width: pageSize.width, height: ceil(used.height) + margin * 2))
    container.addSubview(textView)
    textView.setFrameOrigin(NSPoint(x: margin, y: margin))

    let printInfo = NSPrintInfo()
    printInfo.paperSize = pageSize
    printInfo.topMargin = margin
    printInfo.bottomMargin = margin
    printInfo.leftMargin = margin
    printInfo.rightMargin = margin
    printInfo.horizontalPagination = .fit
    printInfo.verticalPagination = .automatic
    printInfo.isHorizontallyCentered = false
    printInfo.isVerticallyCentered = false
    printInfo.jobDisposition = NSPrintInfo.JobDisposition.save
    printInfo.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = URL(fileURLWithPath: outputPath)

    let operation = NSPrintOperation(view: container, printInfo: printInfo)
    operation.showsPrintPanel = false
    operation.showsProgressPanel = false
    guard operation.run() else {
        throw NSError(
            domain: "HTMLToPDF",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Failed rendering \(htmlPath)"]
        )
    }

    guard let pdf = PDFDocument(url: URL(fileURLWithPath: outputPath)) else {
        throw NSError(
            domain: "HTMLToPDF",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "Rendered PDF unreadable at \(outputPath)"]
        )
    }
    return pdf.pageCount
}

for job in jobs {
    let pages = try renderPDF(htmlPath: job.html, outputPath: job.pdf)
    let attrs = try FileManager.default.attributesOfItem(atPath: job.pdf)
    let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
    print("RENDERED\t\(job.pdf)\tpages=\(pages)\tsize=\(size)")
}
