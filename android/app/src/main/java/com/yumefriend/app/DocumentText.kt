package com.yumefriend.app

import android.content.Context
import android.net.Uri
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.util.zip.ZipInputStream

object DocumentText {
    fun read(context: Context, uri: Uri, name: String): Pair<String, String> {
        val kind = kindOf(context, uri, name)
        val text = when (kind) {
            "pdf" -> readPdf(context, uri)
            "docx" -> readDocx(context, uri)
            else -> context.contentResolver.openInputStream(uri)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
        }
        return kind to text
    }

    private fun kindOf(context: Context, uri: Uri, name: String): String {
        val extension = name.substringAfterLast('.', "").lowercase()
        if (extension in setOf("md", "markdown")) return "md"
        if (extension in setOf("txt", "pdf", "docx")) return extension
        return if (context.contentResolver.getType(uri)?.startsWith("text/") == true) "txt" else extension
    }

    private fun readPdf(context: Context, uri: Uri): String {
        val stream = context.contentResolver.openInputStream(uri) ?: return ""
        return PDDocument.load(stream).use { PDFTextStripper().getText(it) }
    }

    private fun readDocx(context: Context, uri: Uri): String {
        val stream = context.contentResolver.openInputStream(uri) ?: return ""
        ZipInputStream(stream).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (entry.name == "word/document.xml") {
                    val xml = zip.bufferedReader().readText()
                    return xml
                        .replace("</w:p>", "\n")
                        .replace("<w:tab/>", "\t")
                        .replace(Regex("<[^>]+>"), "")
                        .replace("&amp;", "&")
                        .replace("&lt;", "<")
                        .replace("&gt;", ">")
                        .replace("&quot;", "\"")
                        .replace("&apos;", "'")
                }
            }
        }
        return ""
    }
}
