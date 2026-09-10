package router

import (
	"net/url"
	"regexp"
	"strings"
)

type paramSpec struct {
	name     string
	catchAll bool
}

type Route struct {
	Pattern string
	Handler any
	regex   *regexp.Regexp
	params  []paramSpec
}

func Compile(pattern string, handler any) *Route {
	segments := strings.Split(strings.Trim(pattern, "/"), "/")
	var params []paramSpec
	var body strings.Builder

	for _, seg := range segments {
		if seg == "" {
			continue
		}
		switch {
		case strings.HasPrefix(seg, "[...") && strings.HasSuffix(seg, "]"):
			name := seg[4 : len(seg)-1]
			params = append(params, paramSpec{name: name, catchAll: true})
			body.WriteString(`/(.+)`)
		case strings.HasPrefix(seg, "[") && strings.HasSuffix(seg, "]"):
			name := seg[1 : len(seg)-1]
			params = append(params, paramSpec{name: name})
			body.WriteString(`/([^/]+)`)
		default:
			body.WriteString("/" + regexp.QuoteMeta(seg))
		}
	}

	pat := body.String()
	if pat == "" {
		pat = "/"
	}

	return &Route{
		Pattern: pattern,
		Handler: handler,
		regex:   regexp.MustCompile("^" + pat + "/?$"),
		params:  params,
	}
}

type Match struct {
	Route  *Route
	Params map[string]string
}

func MatchAll(routes []*Route, path string) *Match {
	if path == "" {
		path = "/"
	}
	for _, r := range routes {
		m := r.regex.FindStringSubmatch(path)
		if m == nil {
			continue
		}
		params := make(map[string]string, len(r.params))
		for i, spec := range r.params {
			raw := m[i+1]
			if spec.catchAll {
				params[spec.name] = raw
			} else if decoded, err := url.QueryUnescape(raw); err == nil {
				params[spec.name] = decoded
			} else {
				params[spec.name] = raw
			}
		}
		return &Match{Route: r, Params: params}
	}
	return nil
}
