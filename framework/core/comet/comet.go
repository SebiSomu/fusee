package comet

import "net/http"

const (
	headerRequest  = "Comet-Request"
	headerTrigger  = "Comet-Trigger"
	headerTarget   = "Comet-Target"
	headerRetarget = "Comet-Retarget"
	headerReswap   = "Comet-Reswap"
	headerPushURL  = "Comet-Push-Url"
	headerRedirect = "Comet-Redirect"
)

func IsComet(r *http.Request) bool {
	return r.Header.Get(headerRequest) == "true"
}

func GetCometTarget(r *http.Request) string {
	return r.Header.Get(headerTarget)
}

func GetCometTrigger(r *http.Request) string {
	return r.Header.Get(headerTrigger)
}

func Retarget(w http.ResponseWriter, selector string) {
	w.Header().Set(headerRetarget, selector)
}

func Reswap(w http.ResponseWriter, mode string) {
	w.Header().Set(headerReswap, mode)
}

func PushURL(w http.ResponseWriter, url string) {
	w.Header().Set(headerPushURL, url)
}

func Redirect(w http.ResponseWriter, url string) {
	w.Header().Set(headerRedirect, url)
}
