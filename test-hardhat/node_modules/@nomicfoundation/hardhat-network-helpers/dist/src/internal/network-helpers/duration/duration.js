export class Duration {
    years(n) {
        return this.days(n) * 365;
    }
    weeks(n) {
        return this.days(n) * 7;
    }
    days(n) {
        return this.hours(n) * 24;
    }
    hours(n) {
        return this.minutes(n) * 60;
    }
    minutes(n) {
        return n * 60;
    }
    seconds(n) {
        return n;
    }
    millis(n) {
        return Math.floor(n / 1000);
    }
}
//# sourceMappingURL=duration.js.map