var gulp = require("gulp"),
    concat = require("gulp-concat"),
    uglify = require("gulp-uglify"),
    sourcemaps = require("gulp-sourcemaps");

var sources = [
    "static/js/models.js",
    "static/js/viewmodel.js",    
    "static/js/views.js",
    "static/js/controller.js",
    "static/js/gamemodule.js",    
];
gulp.task("builddebug", function() {
    return gulp.src(sources)
        .pipe(sourcemaps.init())
        .pipe(concat("app.js"))
        .pipe(sourcemaps.write())
        .pipe(gulp.dest("static/js/"));
});

gulp.task("buildproduction", function() {
    return gulp.src(sources)
        .pipe(concat("app.js"))
        .pipe(uglify())
        .pipe(gulp.dest("static/js/"));
});
