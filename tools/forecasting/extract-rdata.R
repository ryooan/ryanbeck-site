# Extract every data frame out of the local .RData session workspaces into
# plain CSV, one file per data frame, plus a manifest.
#
# Why this exists: for several of these series the workspace under
# ~/Documents/R is the ONLY surviving copy. Nothing was ever committed
# (verified across all 9,026 commits of the source repo) and most of the
# upstream APIs are dead or truncated. An .RData file is a single opaque blob
# that needs R and the original packages to read; CSV needs nothing. Getting
# the numbers out from behind that dependency is the first thing to do.
#
# Read-only with respect to the source: nothing under ~/Documents/R is
# written, renamed or deleted.
#
#   Rscript tools/extract-rdata.R [SRC] [DEST]

args <- commandArgs(trailingOnly = TRUE)
SRC  <- if (length(args) >= 1) args[1] else "C:/Users/ryooa/Documents/R"
DEST <- if (length(args) >= 2) args[2] else "archive/rdata"

# Skip frames too small to be data, and the scratch/duplicate objects that
# accumulate in a long-lived session (test, test5, test112, ...).
MIN_ROWS <- 20
is_scratch <- function(n) grepl("^(test|tmp|temp|x|y|z)[0-9]*$", n)

dir.create(DEST, recursive = TRUE, showWarnings = FALSE)

dirs <- list.dirs(SRC, recursive = TRUE)
dirs <- dirs[!grepl("Rproj.user", dirs, fixed = TRUE)]
dirs <- dirs[!grepl(".git", dirs, fixed = TRUE)]

manifest <- list()

for (d in dirs) {
  f <- file.path(d, ".RData")
  if (!file.exists(f)) next

  e  <- new.env()
  ok <- tryCatch({ suppressWarnings(load(f, envir = e)); TRUE },
                 error = function(x) { message("  cannot load: ", d); FALSE })
  if (!ok) next

  rel <- sub(paste0(SRC, "/"), "", d, fixed = TRUE)
  # Flatten the workspace path into a single directory name.
  slug <- gsub("[^A-Za-z0-9]+", "-", rel)
  slug <- tolower(gsub("(^-|-$)", "", slug))
  outdir <- file.path(DEST, slug)

  wrote <- 0
  for (o in ls(e)) {
    if (is_scratch(o)) next
    v <- tryCatch(get(o, envir = e), error = function(x) NULL)
    if (!is.data.frame(v) || nrow(v) < MIN_ROWS) next

    # List-columns cannot go to CSV; flatten them rather than dropping rows.
    for (cn in names(v)) {
      if (is.list(v[[cn]])) {
        v[[cn]] <- vapply(v[[cn]],
                          function(x) paste(unlist(x), collapse = "|"),
                          character(1))
      }
    }

    dir.create(outdir, recursive = TRUE, showWarnings = FALSE)
    out <- file.path(outdir, paste0(o, ".csv"))
    tryCatch({
      write.csv(v, out, row.names = FALSE, na = "")
      wrote <- wrote + 1
      # Record the date span so the manifest says what each file covers.
      span <- ""
      for (cn in names(v)) {
        col <- v[[cn]]
        if (inherits(col, "Date") || inherits(col, "POSIXt")) {
          span <- paste0(min(col, na.rm = TRUE), " .. ", max(col, na.rm = TRUE))
          break
        }
      }
      manifest[[length(manifest) + 1]] <- data.frame(
        workspace = rel, object = o, rows = nrow(v), cols = ncol(v),
        date_span = span, file = file.path(slug, paste0(o, ".csv")),
        stringsAsFactors = FALSE)
    }, error = function(x) message("  failed ", o, ": ", conditionMessage(x)))
  }
  if (wrote) cat(sprintf("%-46s %2d frames\n", rel, wrote))
}

m <- do.call(rbind, manifest)
m <- m[order(m$workspace, -m$rows), ]
write.csv(m, file.path(DEST, "MANIFEST.csv"), row.names = FALSE, na = "")

cat("\n", nrow(m), " data frames, ", format(sum(m$rows), big.mark = ","),
    " rows total -> ", DEST, "\n", sep = "")
