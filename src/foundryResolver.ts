// For the purposes of explanation the POSIX path seperator `/` is used but both seperators are accounted for.
//
// Path traversing up a directory can be Foundry paths. Given how simple that is stated to be you might expect a simple Regex to accompany it. Unfortunately there would be false negatives if the Regex simply check for a path starting with `../`, primarily due to fact that unnormalized paths are more complicated.
// For example a pathological but valid import like `./a/../..` wouldn't be matched by a Regex expecting it to start with `..
//
// Here's a way to rewrite the Regex if `.`, `\`, and `/` were not meta-characters and whitespace was not matched at all.
// ^(
//     (
//         (.[/\]+)|                  # Matches the path segment `.` which doesn't ultimately effect anything. Something like `/.//././././//` won't effect where the path resolves to as long as its put between path segments.
//         ([^/\]+[/\]+)+?..[/\]+     # Matches any other path segment(s) followed by the `..` path segment which effectively cancel out as long as they match in count, i.e. `a/../` also doesn't change how the path resolves.
//                                    # Unfortunately this does introduce a false positive where `../a/b/..` matches but is resolved like `../a` which shouldn't. Unless Golang's Regex engine adds some way to ensure the number of "normal" segments and `..` segments are equal this false positive cannot be eliminated.
//     )*
//     ..([/\]+|$)                    # Matches `../` or `..\` similar to above. The `$` is there for the case where the entire path is `../..` where the overall the match ends before a final `/` or `\` would be required.
// )
export const traversesUpDirectoryRegex =
    /^(((\.[/\\]+)|([^/\\]+[/\\]+)+?\.\.[/\\]+)*\.\.([/\\]+|$))/;
