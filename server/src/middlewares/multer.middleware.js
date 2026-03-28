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
		if (!file?.mimetype || !allowedMimeTypes.has(file.mimetype)) {
			return cb(new Error("Unsupported file type. Please upload image, PDF, DOCX, TXT, CSV, MD, or JSON."))
		}

		cb(null, true)
	}
})

const uploadSingleMedia = upload.single("file")

export { formDataParser, uploadSingleMedia, MAX_UPLOAD_SIZE_BYTES };