package ngalert

import (
	"context"
	"time"

	"github.com/grafana/grafana/pkg/services/ngalert/api"

	"github.com/grafana/grafana/pkg/services/ngalert/schedule"
	"github.com/grafana/grafana/pkg/services/ngalert/store"

	"github.com/benbjohnson/clock"
	"github.com/grafana/grafana/pkg/services/ngalert/eval"
	"github.com/grafana/grafana/pkg/services/sqlstore"
	"github.com/grafana/grafana/pkg/tsdb"

	"github.com/grafana/grafana/pkg/api/routing"
	"github.com/grafana/grafana/pkg/infra/log"
	"github.com/grafana/grafana/pkg/registry"
	"github.com/grafana/grafana/pkg/services/datasources"
	"github.com/grafana/grafana/pkg/services/sqlstore/migrator"
	"github.com/grafana/grafana/pkg/setting"
)

const (
	maxAttempts int64 = 3
	// scheduler interval
	// changing this value is discouraged
	// because this could cause existing alert definition
	// with intervals that are not exactly divided by this number
	// not to be evaluated
	baseIntervalSeconds = 10
	// default alert definiiton interval
	defaultIntervalSeconds int64 = 6 * baseIntervalSeconds
)

// AlertNG is the service for evaluating the condition of an alert definition.
type AlertNG struct {
	Cfg             *setting.Cfg             `inject:""`
	DatasourceCache datasources.CacheService `inject:""`
	RouteRegister   routing.RouteRegister    `inject:""`
	SQLStore        *sqlstore.SQLStore       `inject:""`
	DataService     *tsdb.Service            `inject:""`
	Log             log.Logger
	schedule        schedule.ScheduleService
}

func init() {
	registry.RegisterService(&AlertNG{})
}

// Init initializes the AlertingService.
func (ng *AlertNG) Init() error {
	ng.Log = log.New("ngalert")

	baseInterval := baseIntervalSeconds * time.Second

	store := store.DBstore{BaseInterval: baseInterval, DefaultIntervalSeconds: defaultIntervalSeconds, SQLStore: ng.SQLStore}

	schedCfg := schedule.SchedulerCfg{
		C:            clock.New(),
		BaseInterval: baseInterval,
		Logger:       ng.Log,
		MaxAttempts:  maxAttempts,
		Evaluator:    eval.Evaluator{Cfg: ng.Cfg},
		Store:        store,
	}
	ng.schedule = schedule.NewScheduler(schedCfg, ng.DataService)

	api := api.API{
		Cfg:             ng.Cfg,
		DatasourceCache: ng.DatasourceCache,
		RouteRegister:   ng.RouteRegister,
		DataService:     ng.DataService,
		Schedule:        ng.schedule,
		Store:           store}
	api.RegisterAPIEndpoints()

	return nil
}

// Run starts the scheduler
func (ng *AlertNG) Run(ctx context.Context) error {
	ng.Log.Debug("ngalert starting")
	return ng.schedule.Ticker(ctx)
}

// IsDisabled returns true if the alerting service is disable for this instance.
func (ng *AlertNG) IsDisabled() bool {
	if ng.Cfg == nil {
		return true
	}
	// Check also about expressions?
	return !ng.Cfg.IsNgAlertEnabled()
}

// AddMigration defines database migrations.
// If Alerting NG is not enabled does nothing.
func (ng *AlertNG) AddMigration(mg *migrator.Migrator) {
	if ng.IsDisabled() {
		return
	}
	addAlertDefinitionMigrations(mg)
	addAlertDefinitionVersionMigrations(mg)
	// Create alert_instance table
	alertInstanceMigration(mg)
}
