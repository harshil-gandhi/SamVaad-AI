import multer from "multer";

const formDataParser = multer().none();

const MAX_UPLOAD_SIZE_BYTES = 12 * 1024 * 1024 // 12MB

const allowedMimeTypes = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
	"text/markdown",
	"text/csv",
	"application/json"
])

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: MAX_UPLOAD_SIZE_BYTES,
		files: 1
	},
	fileFilter: (req, file, cb) => {
		const mimeType = String(file?.mimetype || "").toLowerCase()

		if (!mimeType || !allowedMimeTypes.has(mimeType)) {
			const unsupportedFileError = new Error("Unsupported file type. Please upload image, PDF, DOCX, TXT, CSV, MD, or JSON.")
			unsupportedFileError.statusCode = 400
			return cb(unsupportedFileError)
		}

		cb(null, true)
	}
})

const uploadSingleMedia = upload.single("file")

export { formDataParser, uploadSingleMedia, MAX_UPLOAD_SIZE_BYTES };